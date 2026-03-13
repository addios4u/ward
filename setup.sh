#!/bin/bash

# =============================================================================
# Ubuntu 24.04 LTS Auto Setup Script
# =============================================================================

set -e

echo ""
echo "============================================"
echo "   Ubuntu 24.04 LTS Setup Script"
echo "============================================"
echo ""

# =============================================================================
# Section 1: System Package Update
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 1] System Package Update"
echo "=========================================="
echo ""

echo "[1/4] apt update..."
sudo apt update

echo ""
echo "[2/4] apt upgrade..."
sudo apt upgrade -y

echo ""
echo "[3/4] apt-get update..."
sudo apt-get update

echo ""
echo "[4/4] apt-get upgrade..."
sudo apt-get upgrade -y

echo ""
echo "[Done] System package update completed"
echo ""

# =============================================================================
# Section 2: Timezone & Korean Locale
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 2] Timezone & Korean Locale"
echo "=========================================="
echo ""

# Timezone setup
CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "")
if [ "$CURRENT_TZ" = "Asia/Seoul" ]; then
    echo "[1/4] Timezone already set to Asia/Seoul, skipping..."
else
    echo "[1/4] Setting timezone to Asia/Seoul..."
    sudo timedatectl set-timezone Asia/Seoul
fi

# Install Korean language pack
if dpkg -l | grep -q "language-pack-ko"; then
    echo "[2/4] Korean language pack already installed, skipping..."
else
    echo "[2/4] Installing Korean language pack..."
    sudo apt install -y language-pack-ko
fi

# Generate Korean locale
if locale -a | grep -q "ko_KR.utf8"; then
    echo "[3/4] Korean locale already generated, skipping..."
else
    echo "[3/4] Generating Korean locale..."
    sudo locale-gen ko_KR.UTF-8
fi

# Update locale settings
echo "[4/4] Updating locale settings..."
sudo update-locale LANG=ko_KR.UTF-8 LC_ALL=ko_KR.UTF-8

echo ""
echo "[Done] Timezone & Korean locale setup completed"
echo "  - Timezone: $(timedatectl show --property=Timezone --value)"
echo "  - Locale: ko_KR.UTF-8"
echo ""

# =============================================================================
# Section 3: Node.js (nvm) + pnpm + yarn
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 3] Node.js (nvm) + pnpm + yarn"
echo "=========================================="
echo ""

# nvm install
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "[1/4] nvm already installed, skipping..."
else
    echo "[1/4] Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

# Remove .npmrc prefix setting (conflicts with nvm)
if [ -f "$HOME/.npmrc" ]; then
    sed -i '/^prefix=/d' "$HOME/.npmrc"
    sed -i '/^globalconfig=/d' "$HOME/.npmrc"
fi

# Load nvm
. "$NVM_DIR/nvm.sh"

# Node.js LTS install
if command -v node &> /dev/null; then
    echo "[2/4] Node.js already installed: $(node -v), skipping..."
else
    echo "[2/4] Installing Node.js LTS..."
    nvm install --lts
    nvm alias default lts/*
fi

# pnpm install
if command -v pnpm &> /dev/null; then
    echo "[3/4] pnpm already installed: $(pnpm -v), skipping..."
else
    echo "[3/4] Installing pnpm..."
    npm install -g pnpm
fi

# yarn install
if command -v yarn &> /dev/null; then
    echo "[4/4] yarn already installed: $(yarn -v), skipping..."
else
    echo "[4/4] Installing yarn..."
    npm install -g yarn
fi

echo ""
echo "[Done] Node.js setup completed"
echo "  - Node.js: $(node -v)"
echo "  - npm: $(npm -v)"
echo "  - pnpm: $(pnpm -v)"
echo "  - yarn: $(yarn -v)"
echo ""

# =============================================================================
# Section 4: Claude Code
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 4] Claude Code"
echo "=========================================="
echo ""

# Claude Code install
if command -v claude &> /dev/null; then
    echo "[1/1] Claude Code already installed: $(claude --version), skipping..."
else
    echo "[1/1] Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code
fi

echo ""
echo "[Done] Claude Code setup completed"
echo "  - Claude Code: $(claude --version 2>/dev/null || echo 'installed')"
echo ""

# =============================================================================
# Section 5: Docker
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 5] Docker"
echo "=========================================="
echo ""

if command -v docker &> /dev/null; then
    echo "[1/4] Docker already installed: $(docker --version), skipping..."
else
    echo "[1/4] Installing Docker dependencies..."
    sudo apt install -y ca-certificates curl gnupg

    echo ""
    echo "[2/4] Adding Docker GPG key..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo ""
    echo "[3/4] Adding Docker repository..."
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update

    echo ""
    echo "[4/4] Installing Docker..."
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Add current user to docker group
if ! getent group docker | grep -q "\b$USER\b"; then
    echo "[+] Adding user to docker group..."
    sudo usermod -aG docker $USER
else
    echo "[Done] User already in docker group"
fi

# Add docker group auto-apply to .bashrc
DOCKER_BASHRC_SNIPPET='# Auto-apply docker group
if command -v docker &> /dev/null && getent group docker | grep -q "\b$USER\b" && ! id -Gn | grep -q "\bdocker\b"; then
    exec newgrp docker
fi'

if ! grep -q "Auto-apply docker group" ~/.bashrc 2>/dev/null; then
    echo "[+] Adding docker group auto-apply to .bashrc..."
    echo "" >> ~/.bashrc
    echo "$DOCKER_BASHRC_SNIPPET" >> ~/.bashrc
else
    echo "[Done] Docker group auto-apply already in .bashrc"
fi

echo ""
echo "[Done] Docker setup completed"
echo "  - Docker: $(docker --version 2>/dev/null || echo 'installed')"
echo ""

# =============================================================================
# Section 6: Docker Compose Services
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 6] Docker Compose Services"
echo "=========================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"

# Enable Docker service on boot
if ! systemctl is-enabled docker &> /dev/null; then
    echo "[1/3] Enabling Docker service on boot..."
    sudo systemctl enable docker
else
    echo "[1/3] Docker service already enabled on boot, skipping..."
fi

# Build and run Docker Compose services
if [ -d "$DOCKER_DIR" ] && [ -f "$DOCKER_DIR/docker-compose.yml" ]; then
    echo "[2/3] Building Docker images..."
    cd "$DOCKER_DIR"

    # Build PostgreSQL custom image if not exists
    if ! sudo docker images | grep -q "docker-postgresql"; then
        sudo docker compose build postgresql
    else
        echo "  - PostgreSQL image already built, skipping..."
    fi

    echo "[3/3] Starting Docker Compose services..."
    sudo docker compose up -d

    echo ""
    echo "[Done] Docker Compose services started"
    sudo docker compose ps
else
    echo "[2/3] Docker directory not found, skipping..."
    echo "[3/3] Skipping Docker Compose services..."
fi

echo ""
echo "[Done] Docker Compose setup completed"
echo ""

# =============================================================================
# Section 7: Zsh Installation
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 7] Zsh Installation"
echo "=========================================="
echo ""

if command -v zsh &> /dev/null; then
    echo "[1/2] Zsh already installed: $(zsh --version), skipping..."
else
    echo "[1/2] Installing Zsh..."
    sudo apt install -y zsh
fi

echo "[2/2] Zsh installation check..."
zsh --version

echo ""
echo "[Done] Zsh installation completed"
echo "  - Zsh: $(zsh --version)"
echo ""

# =============================================================================
# Section 8: Oh My Zsh Installation
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 8] Oh My Zsh Installation"
echo "=========================================="
echo ""

# Check if Oh My Zsh is already installed
if [ -d "$HOME/.oh-my-zsh" ]; then
    echo "[1/2] Oh My Zsh already installed, skipping..."
else
    echo "[1/2] Installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

echo "[2/2] Configuring .zshrc..."

# Add nvm configuration to .zshrc if not exists
NVM_CONFIG='# nvm configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion'

if ! grep -q "nvm configuration" ~/.zshrc 2>/dev/null; then
    echo "" >> ~/.zshrc
    echo "$NVM_CONFIG" >> ~/.zshrc
    echo "  - Added nvm configuration to .zshrc"
else
    echo "  - nvm configuration already in .zshrc"
fi

# Add docker group auto-apply to .zshrc if not exists
DOCKER_ZSHRC_SNIPPET='# Auto-apply docker group
if command -v docker &> /dev/null && getent group docker | grep -q "\b$USER\b" && ! id -Gn | grep -q "\bdocker\b"; then
    exec newgrp docker
fi'

if ! grep -q "Auto-apply docker group" ~/.zshrc 2>/dev/null; then
    echo "" >> ~/.zshrc
    echo "$DOCKER_ZSHRC_SNIPPET" >> ~/.zshrc
    echo "  - Added docker group auto-apply to .zshrc"
else
    echo "  - Docker group auto-apply already in .zshrc"
fi

echo ""
echo "[Done] Oh My Zsh setup completed"
echo ""

# =============================================================================
# Section 9: Change Default Shell
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 9] Change Default Shell"
echo "=========================================="
echo ""

ZSH_PATH=$(which zsh)
CURRENT_USER_SHELL=$(getent passwd $USER | cut -d: -f7)

echo "[1/3] Current shell check..."
echo "  - Current shell: $CURRENT_USER_SHELL"
echo "  - Zsh path: $ZSH_PATH"

if [ "$CURRENT_USER_SHELL" = "$ZSH_PATH" ]; then
    echo "[2/3] Default shell is already zsh, skipping..."
else
    echo "[2/3] Changing default shell to zsh..."
    sudo chsh -s "$ZSH_PATH" $USER
    echo "  - Default shell change command executed"
fi

echo "[3/3] Verifying shell change..."
NEW_SHELL=$(getent passwd $USER | cut -d: -f7)
echo "  - New default shell: $NEW_SHELL"

if [ "$NEW_SHELL" = "$ZSH_PATH" ]; then
    echo "  ✓ Shell successfully changed to zsh"
else
    echo "  ✗ Warning: Shell change may not have taken effect"
    echo "  - Try running manually: sudo chsh -s $ZSH_PATH $USER"
fi

echo ""
echo "[Done] Default shell setup completed"
echo "  - Default shell in /etc/passwd: $NEW_SHELL"
echo "  - Please log out and log back in for the change to take effect"
echo ""

# =============================================================================
# Section 10: Oh My Zsh Plugins
# =============================================================================

echo ""
echo "=========================================="
echo "   [Section 10] Oh My Zsh Plugins"
echo "=========================================="
echo ""

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

# zsh-autosuggestions
if [ -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ]; then
    echo "[1/2] zsh-autosuggestions already installed, skipping..."
else
    echo "[1/2] Installing zsh-autosuggestions..."
    git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
fi

# zsh-syntax-highlighting
if [ -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ]; then
    echo "[2/2] zsh-syntax-highlighting already installed, skipping..."
else
    echo "[2/2] Installing zsh-syntax-highlighting..."
    git clone https://github.com/zsh-users/zsh-syntax-highlighting.git "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"
fi

# Update plugins in .zshrc
if grep -q "^plugins=(" ~/.zshrc; then
    if ! grep -q "zsh-autosuggestions" ~/.zshrc; then
        echo ""
        echo "[+] Updating .zshrc plugins..."
        sed -i 's/^plugins=(\(.*\))/plugins=(git zsh-autosuggestions zsh-syntax-highlighting)/' ~/.zshrc
        echo "  - Added plugins: git zsh-autosuggestions zsh-syntax-highlighting"
    else
        echo "  - Plugins already configured in .zshrc"
    fi
fi

echo ""
echo "[Done] Oh My Zsh plugins setup completed"
echo ""

# =============================================================================
# Final Message
# =============================================================================

echo ""
echo "============================================"
echo "   Setup Completed!"
echo "============================================"
echo ""
echo "Sections completed:"
echo "  1. System Package Update"
echo "  2. Timezone & Korean Locale"
echo "  3. Node.js (nvm) + pnpm + yarn"
echo "  4. Claude Code"
echo "  5. Docker"
echo "  6. Docker Compose Services"
echo "  7. Zsh Installation"
echo "  8. Oh My Zsh Installation"
echo "  9. Change Default Shell"
echo " 10. Oh My Zsh Plugins"
echo ""
echo "To start using Zsh with Oh My Zsh:"
echo "  1. Run: exec zsh"
echo "  2. Or log out and log back in"
echo ""
echo "Installed plugins:"
echo "  - git"
echo "  - zsh-autosuggestions"
echo "  - zsh-syntax-highlighting"
echo ""

# =============================================================================
# Docker 그룹 적용 (모든 설치 완료 후 마지막 단계)
# =============================================================================

if ! id -Gn | grep -q '\bdocker\b'; then
    echo ""
    echo "=========================================="
    echo "   Docker 그룹 적용 중..."
    echo "=========================================="
    echo ""
    echo "docker 그룹이 현재 세션에 적용되지 않았습니다."
    echo "새 그룹 적용을 위해 세션을 전환합니다 (newgrp docker)..."
    echo ""
    exec newgrp docker
fi
