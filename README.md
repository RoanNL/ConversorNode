# 🎵 Conversor de Músicas, Imagens e Removedor de Fundo! 

Uma aplicação web local super rápida para baixar músicas individuais ou playlists inteiras diretamente para o seu computador em formato MP3. Conta com uma interface amigável, barras de progresso dinâmicas e envia os arquivos direto para o gerenciador de downloads do seu navegador. Além disso, conta com outras duas funcionalidades de removedor de fundo branco ou de qualquer outra cor da imagem e um excelente conversor de imagens para tipos e extensões diferentes.

## 🛠️ 1. Pré-requisitos
Antes de começar, você precisa ter duas ferramentas instaladas no seu computador:

* **Node.js:** Baixe e instale a versão LTS no [site oficial (nodejs.org)](https://nodejs.org/).
* **FFmpeg** (O motor de conversão de áudio, obrigatório):
  * **Windows:** Abra o Prompt de Comando e digite `winget install ffmpeg`. (Ou baixe o executável no site oficial e adicione às variáveis de ambiente).
  * **Mac:** No terminal, digite `brew install ffmpeg`.
  * **Linux (Ubuntu/Debian):** No terminal, digite `sudo apt install ffmpeg`.

## 📥 2. Instalação do Projeto
1. Baixe os arquivos deste projeto (via ZIP ou `git clone`) e extraia em uma pasta no seu computador.
2. Abra o terminal (Prompt de Comando ou PowerShell) **dentro da pasta do projeto**.
3. Instale as bibliotecas necessárias digitando o comando abaixo e apertando Enter:
   ```bash
   npm install express multer sharp jimp@0.16.1 spotify-web-api-node youtube-dl-exec
   ```

## 🔑 3. Configuração do Spotify
Para que o programa consiga ler as playlists do Spotify, você precisa de chaves de acesso gratuitas.

1. Acesse o Spotify for Developers e faça login com sua conta normal do Spotify.

2. Clique no botão Create App.

3. Dê um nome qualquer ao app. No campo Redirect URI, digite https://google.com (só para preencher o requisito) e salve.

4. Na página do seu aplicativo criado, clique em Settings.

5. Lá estarão o seu Client ID e o seu Client Secret (clique em "View client secret" para ver).

6. Abra o arquivo server.js deste projeto em um Bloco de Notas ou editor de código.

7. Logo no topo do código, substitua os textos COLE_SEU_CLIENT_ID_AQUI e COLE_SEU_CLIENT_SECRET_AQUI pelas chaves que você acabou de copiar. Salve o arquivo.

## 🚀 4. Como Usar
Sempre que quiser baixar músicas, siga estes passos simples:

1. Abra o terminal dentro da pasta do projeto.

2. Inicie o servidor com o comando:

```bash
   node server.js
   ```

3. Não feche essa janela preta. Abra o seu navegador e acesse: http://localhost:5000

4. Cole o link da sua música, álbum ou playlist (Spotify, Deezer ou YouTube), escolha a qualidade e clique em Iniciar!


Nota: Na primeira vez que você baixar uma playlist com várias músicas, o seu navegador (Chrome/Edge) vai perguntar se você permite baixar múltiplos arquivos de uma vez. Clique em "Permitir" e as músicas choverão na sua pasta de Downloads!
