#!/bin/bash
# Instala ou atualiza o DaazNexus no Mac.
# Remove a quarentena do Gatekeeper (o app não está assinado com certificado
# Apple, por isso o macOS bloqueia-o por defeito) e copia o app para
# /Applications automaticamente — sem teres de arrastar nada no Finder.
#
# Uso: dá duplo-clique neste ficheiro no Finder, ou corre no Terminal:
#   bash install-mac.command

set -e

APP_NAME="DaazNexus"
DOWNLOADS="$HOME/Downloads"

echo "== Instalador DaazNexus =="
echo ""

# 1. Encontrar o .dmg mais recente descarregado
DMG=$(ls -t "$DOWNLOADS"/DaazNexus-*.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "Não encontrei nenhum ficheiro DaazNexus-*.dmg em $DOWNLOADS"
  echo "Descarrega primeiro a última versão em:"
  echo "  https://github.com/daazlabs/nexus-desktop/releases/latest"
  read -p "Prime Enter para sair..."
  exit 1
fi
echo "A instalar a partir de: $DMG"

# 2. Remover a quarentena do dmg (evita o aviso "está danificado e não pode ser aberto")
xattr -d com.apple.quarantine "$DMG" 2>/dev/null || true

# 3. Montar o dmg
MOUNT_POINT=$(hdiutil attach "$DMG" -nobrowse -noautoopen | grep -o '/Volumes/.*' | tail -1)
if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT/$APP_NAME.app" ]; then
  echo "Não consegui montar o dmg ou encontrar $APP_NAME.app lá dentro."
  exit 1
fi

# 4. Substituir a versão instalada, se existir
if [ -d "/Applications/$APP_NAME.app" ]; then
  echo "A remover versão antiga de /Applications..."
  rm -rf "/Applications/$APP_NAME.app"
fi
echo "A copiar para /Applications..."
cp -R "$MOUNT_POINT/$APP_NAME.app" /Applications/

# 5. Desmontar o dmg
hdiutil detach "$MOUNT_POINT" -quiet

# 6. Remover a quarentena também da cópia instalada
xattr -rd com.apple.quarantine "/Applications/$APP_NAME.app" 2>/dev/null || true

echo ""
echo "$APP_NAME instalado/atualizado em /Applications."
echo ""
read -p "Abrir agora? (s/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
  open "/Applications/$APP_NAME.app"
fi
