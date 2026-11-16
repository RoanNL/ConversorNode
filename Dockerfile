# Usa uma máquina Linux com Node.js
FROM node:18

# Instala o FFmpeg (necessário para converter para MP3)
RUN apt-get update && apt-get install -y ffmpeg

# Define a pasta de trabalho
WORKDIR /app

# Copia os arquivos de configuração e instala as dependências
COPY package*.json ./
RUN npm install

# Copia o resto do projeto
COPY . .

# Expõe a porta 5000
EXPOSE 5000

# Comando para iniciar
CMD ["node", "server.js"]