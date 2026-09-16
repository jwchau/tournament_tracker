FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Invoke vite.js directly (not via `npm run dev`/.bin shim): Docker Desktop's
# VM kernel reports "WSL2", which makes npm's bin shim try to exec node.exe.
CMD ["node", "./node_modules/vite/bin/vite.js", "--host", "0.0.0.0"]
