FROM node:20-slim

# Install Tectonic for PDF compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -L -o /usr/local/bin/tectonic \
    https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-unknown-linux-gnu.tar.gz \
    && tar -xzf /usr/local/bin/tectonic -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/tectonic \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Alternative: install via cargo if tar approach fails
RUN which tectonic || (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . /root/.cargo/env && cargo install tectonic) || true

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

# Create temp directory
RUN mkdir -p /app/tmp

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "index.js"]
