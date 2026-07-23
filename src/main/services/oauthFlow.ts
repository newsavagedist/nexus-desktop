import crypto from 'node:crypto'
import http from 'node:http'
import { shell } from 'electron'

export interface OAuthTokenBlob {
  access_token: string
  refresh_token?: string
  expires_at: number
  scopes: string[]
}

export interface OAuthFlowConfig {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret?: string
  scopes: string[]
  extraAuthorizeParams?: Record<string, string>
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(40).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

function listenForCallback(): Promise<{
  server: http.Server
  port: number
  waitForCode: () => Promise<{ code: string; state: string }>
}> {
  return new Promise((resolve, reject) => {
    let settleCode: (v: { code: string; state: string }) => void
    let rejectCode: (e: Error) => void
    const codePromise = new Promise<{ code: string; state: string }>((res, rej) => {
      settleCode = res
      rejectCode = rej
    })

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (error || !code || !state) {
        res.end('<html><body><h2>Falha na ligação. Podes fechar esta janela e tentar de novo.</h2></body></html>')
        rejectCode(new Error(error || 'missing code/state in OAuth redirect'))
        return
      }
      res.end('<html><body><h2>Ligado! Podes fechar esta janela e voltar à app.</h2></body></html>')
      settleCode({ code, state })
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        resolve({ server, port: address.port, waitForCode: () => codePromise })
      } else {
        reject(new Error('failed to bind loopback OAuth callback server'))
      }
    })
    server.on('error', reject)
  })
}

// Desktop's redirect target is a loopback HTTP server on an ephemeral port
// (Google's "Desktop app" client type is designed for exactly this — no
// fixed redirect_uri needs to be pre-registered, unlike the backend's "Web
// application" client). PKCE replaces the need to keep a client_secret truly
// confidential, which a distributed Electron binary can't do anyway.
// 2 minutes was too tight for a first-time consent: an app still in Google's
// "Testing" mode shows an extra "unverified app" interstitial (an "Advanced"
// link to click through) before the real consent screen, and the loopback
// server was closing itself before the user made it back — a real Google
// redirect landed on a port nobody was listening on anymore.
export async function runPkceFlow(config: OAuthFlowConfig, timeoutMs = 600000): Promise<OAuthTokenBlob> {
  const { verifier, challenge } = pkcePair()
  const state = crypto.randomBytes(16).toString('hex')
  const { server, port, waitForCode } = await listenForCallback()

  try {
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const authParams = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(config.extraAuthorizeParams || {}),
    })
    await shell.openExternal(`${config.authorizeUrl}?${authParams.toString()}`)

    const { code, state: returnedState } = await Promise.race([
      waitForCode(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo esgotado à espera da autorização no browser')), timeoutMs),
      ),
    ])
    if (returnedState !== state) throw new Error('state devolvido pelo browser não corresponde — tenta novamente')

    const tokenBody = new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })
    if (config.clientSecret) tokenBody.set('client_secret', config.clientSecret)

    const tokenResp = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    if (!tokenResp.ok) {
      throw new Error(`Troca de código por token falhou: HTTP ${tokenResp.status}`)
    }
    const data = await tokenResp.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() / 1000 + (data.expires_in || 3600),
      scopes: config.scopes,
    }
  } finally {
    server.close()
  }
}

export async function refreshAccessToken(
  tokenUrl: string, clientId: string, clientSecret: string | undefined, refreshToken: string,
): Promise<{ access_token: string; expires_at: number }> {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) throw new Error(`Refresh de token falhou: HTTP ${resp.status}`)
  const data = await resp.json()
  return { access_token: data.access_token, expires_at: Date.now() / 1000 + (data.expires_in || 3600) }
}
