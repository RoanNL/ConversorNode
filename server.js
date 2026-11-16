const express = require('express');
const path = require('path');
const fs = require('fs');
const SpotifyWebApi = require('spotify-web-api-node');
const youtubedl = require('youtube-dl-exec');

// ==========================================
// CONFIGURAÇÕES DO SPOTIFY
// ==========================================
const spotifyApi = new SpotifyWebApi({
    clientId: 'COLE_SEU_CLIENT_ID_AQUI',
    clientSecret: 'COLE_SEU_CLIENT_SECRET_AQUI'
});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve os arquivos da pasta "public" (seu index.html)
app.use(express.static('public'));

// Pasta temporária para downloads
const PASTA_TEMP = path.join(__dirname, 'temp_musicas');
if (fs.existsSync(PASTA_TEMP)) {
    fs.rmSync(PASTA_TEMP, { recursive: true, force: true });
}
fs.mkdirSync(PASTA_TEMP);

// Objeto global de progresso
let progresso_global = {};

// --- FUNÇÕES DE EXTRAÇÃO ---

async function autenticarSpotify() {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
}

async function obter_musicas_spotify(url) {
    let musicas = [];
    try {
        await autenticarSpotify();
        const id = url.split('/').pop().split('?')[0];

        if (url.includes('playlist')) {
            let offset = 0;
            let total = 1;
            while (offset < total) {
                const res = await spotifyApi.getPlaylistTracks(id, { limit: 100, offset: offset });
                total = res.body.total;
                res.body.items.forEach(item => {
                    if (item.track) {
                        const nome = `${item.track.artists[0].name} - ${item.track.name}`;
                        musicas.push({ titulo: nome, busca: nome });
                    }
                });
                offset += 100;
            }
        } else if (url.includes('album')) {
            const res = await spotifyApi.getAlbumTracks(id, { limit: 50 });
            res.body.items.forEach(item => {
                const nome = `${item.artists[0].name} - ${item.name}`;
                musicas.push({ titulo: nome, busca: nome });
            });
        } else if (url.includes('track')) {
            const res = await spotifyApi.getTrack(id);
            const nome = `${res.body.artists[0].name} - ${res.body.name}`;
            musicas.push({ titulo: nome, busca: nome });
        }
    } catch (e) {
        console.error("Erro Spotify:", e);
    }
    return musicas;
}

async function obter_musicas_deezer(url) {
    let musicas = [];
    try {
        const idMatch = url.match(/(playlist|album|track)\/(\d+)/);
        if (!idMatch) return musicas;
        
        const tipo = idMatch[1];
        const id = idMatch[2];
        const response = await fetch(`https://api.deezer.com/${tipo}/${id}`);
        const data = await response.json();

        if (tipo === 'track') {
            musicas.push({ titulo: `${data.artist.name} - ${data.title}`, busca: `${data.artist.name} - ${data.title}` });
        } else if (data.tracks && data.tracks.data) {
            data.tracks.data.forEach(t => {
                musicas.push({ titulo: `${t.artist.name} - ${t.title}`, busca: `${t.artist.name} - ${t.title}` });
            });
        }
    } catch (e) {
        console.error("Erro Deezer:", e);
    }
    return musicas;
}

async function obter_musicas_youtube_playlist(url) {
    let musicas = [];
    try {
        const match = url.match(/list=([a-zA-Z0-9_-]+)/);
        if (match) url = `https://www.youtube.com/playlist?list=${match[1]}`;

        // Extrai as informações da playlist sem baixar
        const info = await youtubedl(url, { dumpSingleJson: true, flatPlaylist: true });
        
        if (info && info.entries) {
            info.entries.forEach(entry => {
                if (entry && entry.id) {
                    musicas.push({
                        titulo: entry.title || 'Vídeo do YouTube',
                        busca: `https://www.youtube.com/watch?v=${entry.id}`
                    });
                }
            });
        }
    } catch (e) {
        console.error("Erro YouTube Playlist:", e);
    }
    return musicas;
}

// --- FUNÇÃO DE DOWNLOAD ---

function baixar_musica(item, qualidade) {
    return new Promise((resolve) => {
        let termo_de_busca = item.busca;
        const titulo_exibicao = item.titulo_unico;
        
        if (!termo_de_busca.includes('youtube.com') && !termo_de_busca.includes('youtu.be')) {
            termo_de_busca = `ytsearch1:${termo_de_busca}`;
        }

        progresso_global[titulo_exibicao] = { status: 'Iniciando...', percent: '0%' };

        const subprocess = youtubedl.exec(termo_de_busca, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: qualidade + 'K', // Ex: 192K
            output: path.join(PASTA_TEMP, '%(title)s.%(ext)s'),
            noPlaylist: true
        });

        // Lendo os logs em tempo real para atualizar as barras de progresso
        subprocess.stdout.on('data', (data) => {
            const texto = data.toString();
            
            // Captura a porcentagem de download
            const matchProgresso = texto.match(/\[download\]\s+([\d\.]+)%/);
            if (matchProgresso) {
                progresso_global[titulo_exibicao].status = 'Baixando do YouTube...';
                progresso_global[titulo_exibicao].percent = matchProgresso[1] + '%';
            }

            // Detecta quando o yt-dlp avisa o nome final do arquivo MP3 gerado
            const matchDestino = texto.match(/Destination:\s+(.*?\.mp3)/i);
            if (matchDestino) {
                progresso_global[titulo_exibicao].status = 'Convertendo para MP3 (Aguarde)...';
                progresso_global[titulo_exibicao].percent = '100%';
                
                const nomeFinal = path.basename(matchDestino[1]);
                progresso_global[titulo_exibicao].arquivo_pronto = nomeFinal;
            }
        });

        subprocess.on('close', (code) => {
            if (code === 0) {
                progresso_global[titulo_exibicao].status = '✅ Finalizado! Enviando ao navegador...';
                progresso_global[titulo_exibicao].percent = '100%';
            } else {
                progresso_global[titulo_exibicao].status = '❌ Erro ao baixar.';
            }
            resolve();
        });
    });
}

// Processa a fila em background sem travar a API
async function processar_fila(link, qualidade) {
    const chave_analise = "🔍 Analisando Link...";
    progresso_global[chave_analise] = { status: 'Lendo a plataforma...', percent: '10%' };

    let lista_de_musicas = [];

    if (link.includes('deezer.com')) {
        lista_de_musicas = await obter_musicas_deezer(link);
    } else if (link.includes('spotify.com')) {
        lista_de_musicas = await obter_musicas_spotify(link);
    } else if (link.includes('youtube.com/playlist') || link.includes('list=')) {
        lista_de_musicas = await obter_musicas_youtube_playlist(link);
    } else {
        lista_de_musicas = [{ titulo: 'Vídeo do YouTube', busca: link }];
    }

    delete progresso_global[chave_analise];

    if (lista_de_musicas.length === 0) {
        progresso_global["Erro"] = { status: 'Nenhuma música encontrada.', percent: '0%' };
        return;
    }

    // Adiciona as músicas na tela com o status de "Na fila"
    lista_de_musicas.forEach((item, index) => {
        item.titulo_unico = `${String(index + 1).padStart(2, '0')}. ${item.titulo}`;
        progresso_global[item.titulo_unico] = { status: '⏳ Na fila...', percent: '0%' };
    });

    // Baixa uma por vez (evita travar o PC com muitos processos FFmpeg simultâneos)
    for (const item of lista_de_musicas) {
        await baixar_musica(item, qualidade);
    }
}

// --- ROTAS DO SERVIDOR ---

app.post('/api/baixar', (req, res) => {
    progresso_global = {}; 
    const { link, qualidade } = req.body;
    
    processar_fila(link, qualidade);
    
    res.json({ status: "iniciado" });
});

app.get('/api/progresso', (req, res) => {
    res.json(progresso_global);
});

app.get('/download_final/:nome_arquivo', (req, res) => {
    const caminho = path.join(PASTA_TEMP, req.params.nome_arquivo);
    res.download(caminho); 
});

// Inicia o servidor
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Node.js rodando! Acesse http://localhost:${PORT}`);
});