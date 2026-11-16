const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const SpotifyWebApi = require('spotify-web-api-node');
const youtubedl = require('youtube-dl-exec');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public')); // Serve o Hub e as telas

// ==========================================
// CONFIGURAÇÕES GERAIS E PASTAS
// ==========================================
const spotifyApi = new SpotifyWebApi({
    clientId: 'COLE_SEU_CLIENT_ID_AQUI',
    clientSecret: 'COLE_SEU_CLIENT_SECRET_AQUI'
});

const PASTA_MUSICAS = path.join(__dirname, 'temp_musicas');
const PASTA_UPLOADS = path.join(__dirname, 'uploads');

// Limpa/Cria as pastas temporárias sempre que o servidor liga
[PASTA_MUSICAS, PASTA_UPLOADS].forEach(pasta => {
    if (fs.existsSync(pasta)) fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta);
});

const upload = multer({ dest: 'uploads/' });
let progresso_global = {}; // Variável do progresso das músicas

// ==========================================
// MÓDULO 1: CONVERSOR DE MÚSICAS (MP3)
// ==========================================
async function autenticarSpotify() {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
}

// (As funções de extração de texto foram minimizadas aqui para poupar espaço, 
// mas usam a mesma lógica robusta que já havíamos criado)
async function obter_musicas_spotify(url) {
    let musicas = [];
    try {
        await autenticarSpotify();
        const id = url.split('/').pop().split('?')[0];
        if (url.includes('playlist')) {
            let offset = 0, total = 1;
            while (offset < total) {
                const res = await spotifyApi.getPlaylistTracks(id, { limit: 100, offset: offset });
                total = res.body.total;
                res.body.items.forEach(i => { if (i.track) musicas.push({ titulo: `${i.track.artists[0].name} - ${i.track.name}`, busca: `${i.track.artists[0].name} - ${i.track.name}` }); });
                offset += 100;
            }
        } else if (url.includes('album')) {
            const res = await spotifyApi.getAlbumTracks(id, { limit: 50 });
            res.body.items.forEach(i => musicas.push({ titulo: `${i.artists[0].name} - ${i.name}`, busca: `${i.artists[0].name} - ${i.name}` }));
        } else if (url.includes('track')) {
            const res = await spotifyApi.getTrack(id);
            musicas.push({ titulo: `${res.body.artists[0].name} - ${res.body.name}`, busca: `${res.body.artists[0].name} - ${res.body.name}` });
        }
    } catch (e) { console.error("Erro Spotify:", e); }
    return musicas;
}

async function obter_musicas_deezer(url) {
    let musicas = [];
    try {
        const idMatch = url.match(/(playlist|album|track)\/(\d+)/);
        if (!idMatch) return musicas;
        const res = await (await fetch(`https://api.deezer.com/${idMatch[1]}/${idMatch[2]}`)).json();
        if (idMatch[1] === 'track') musicas.push({ titulo: `${res.artist.name} - ${res.title}`, busca: `${res.artist.name} - ${res.title}` });
        else if (res.tracks) res.tracks.data.forEach(t => musicas.push({ titulo: `${t.artist.name} - ${t.title}`, busca: `${t.artist.name} - ${t.title}` }));
    } catch (e) { console.error("Erro Deezer:", e); }
    return musicas;
}

async function obter_musicas_youtube(url) {
    let musicas = [];
    try {
        const match = url.match(/list=([a-zA-Z0-9_-]+)/);
        if (match) url = `https://www.youtube.com/playlist?list=${match[1]}`;
        const info = await youtubedl(url, { dumpSingleJson: true, flatPlaylist: true });
        if (info && info.entries) info.entries.forEach(e => { if (e && e.id) musicas.push({ titulo: e.title || 'Vídeo', busca: `https://www.youtube.com/watch?v=${e.id}` }); });
    } catch (e) { console.error("Erro YouTube:", e); }
    return musicas;
}

function baixar_musica(item, qualidade) {
    return new Promise((resolve) => {
        let busca = item.busca.includes('youtube.com') || item.busca.includes('youtu.be') ? item.busca : `ytsearch1:${item.busca}`;
        progresso_global[item.titulo_unico] = { status: 'Iniciando...', percent: '0%' };
        
        const configs = {
            extractAudio: true, audioFormat: 'mp3', audioQuality: qualidade + 'K',
            output: path.join(PASTA_MUSICAS, '%(title)s.%(ext)s'), noPlaylist: true, noWarnings: true
        };
        // Carrega cookies automaticamente se o ficheiro existir na pasta (bom para evitar bloqueios)
        if (fs.existsSync('cookies.txt')) configs.cookies = 'cookies.txt';

        const sub = youtubedl.exec(busca, configs);
        sub.stdout.on('data', (d) => {
            const txt = d.toString();
            const pct = txt.match(/\[download\]\s+([\d\.]+)%/);
            if (pct) { progresso_global[item.titulo_unico].status = 'Baixando...'; progresso_global[item.titulo_unico].percent = pct[1] + '%'; }
            const dest = txt.match(/Destination:\s+(.*?\.mp3)/i);
            if (dest) { progresso_global[item.titulo_unico].status = 'Convertendo...'; progresso_global[item.titulo_unico].percent = '100%'; progresso_global[item.titulo_unico].arquivo_pronto = path.basename(dest[1]); }
        });
        sub.catch(() => { progresso_global[item.titulo_unico] = { status: '❌ Erro no download.', percent: '100%' }; resolve(); });
        sub.on('close', (c) => { if (c === 0) progresso_global[item.titulo_unico].status = '✅ Concluído!'; resolve(); });
    });
}

app.post('/api/baixar', (req, res) => {
    progresso_global = {};
    const { link, qualidade } = req.body;
    
    (async () => {
        let lista = [];
        if (link.includes('deezer.com')) lista = await obter_musicas_deezer(link);
        else if (link.includes('spotify.com')) lista = await obter_musicas_spotify(link);
        else if (link.includes('list=')) lista = await obter_musicas_youtube(link);
        else lista = [{ titulo: 'Vídeo do YouTube', busca: link }];
        
        if (lista.length === 0) { progresso_global["Erro"] = { status: 'Nada encontrado.', percent: '0%' }; return; }
        
        lista.forEach((i, idx) => { i.titulo_unico = `${String(idx + 1).padStart(2, '0')}. ${i.titulo}`; progresso_global[i.titulo_unico] = { status: '⏳ Na fila...', percent: '0%' }; });
        for (const i of lista) await baixar_musica(i, qualidade);
    })();
    res.json({ status: "iniciado" });
});

app.get('/api/progresso', (req, res) => res.json(progresso_global));
app.get('/download_final/:nome', (req, res) => res.download(path.join(PASTA_MUSICAS, req.params.nome)));


// ==========================================
// MÓDULO 2: CONVERSOR DE IMAGENS
// ==========================================
app.post('/api/converter', upload.single('imagem'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem.' });
        const dest = req.body.formato, nomeFinal = `${path.parse(req.file.originalname).name}_convertido.${dest}`;
        const caminhoFinal = path.join(PASTA_UPLOADS, nomeFinal);

        await sharp(req.file.path).toFormat(dest).toFile(caminhoFinal);

        res.download(caminhoFinal, nomeFinal, () => {
            try { fs.unlinkSync(req.file.path); fs.unlinkSync(caminhoFinal); } catch (e) {}
        });
    } catch (e) { res.status(500).json({ erro: 'Falha.' }); }
});



// ==========================================
// MÓDULO 3: REMOVEDOR DE FUNDO (HÍBRIDO: BORDAS OU GLOBAL)
// ==========================================
app.post('/api/remover-fundo', upload.single('imagem'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem.' });
        
        const tolerancia = parseInt(req.body.tolerancia) || 30; 
        const corHex = req.body.cor || '#ffffff';
        const modoRemocao = req.body.modo || 'bordas'; // 'bordas' ou 'global'
        
        const hex = corHex.replace('#', '');
        const alvoR = parseInt(hex.substring(0, 2), 16);
        const alvoG = parseInt(hex.substring(2, 4), 16);
        const alvoB = parseInt(hex.substring(4, 6), 16);

        const nomeFinal = `${path.parse(req.file.originalname).name}_sem_fundo.png`;
        const caminhoFinal = path.join(PASTA_UPLOADS, nomeFinal);

        const imagemBuffer = await sharp(req.file.path).png().toBuffer();
        const img = await Jimp.read(imagemBuffer);
        
        const width = img.bitmap.width;
        const height = img.bitmap.height;
        const data = img.bitmap.data;

        function isTargetColor(idx) {
            if (data[idx + 3] === 0) return false; 
            const r = data[idx]; const g = data[idx + 1]; const b = data[idx + 2];
            return (Math.abs(r - alvoR) <= tolerancia && Math.abs(g - alvoG) <= tolerancia && Math.abs(b - alvoB) <= tolerancia);
        }

        // 1. ESCOLHE O ALGORITMO DE REMOÇÃO BASEADO NA ESCOLHA DO USUÁRIO
        if (modoRemocao === 'bordas') {
            // Modo "Balde de Tinta" (Preserva o interior - Ex: Bola de futebol)
            const stack = [];
            for (let x = 0; x < width; x++) { stack.push([x, 0]); stack.push([x, height - 1]); }
            for (let y = 0; y < height; y++) { stack.push([0, y]); stack.push([width - 1, y]); }

            while (stack.length > 0) {
                const [x, y] = stack.pop();
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                const idx = (y * width + x) * 4;
                if (isTargetColor(idx)) {
                    data[idx + 3] = 0;
                    stack.push([x + 1, y]); stack.push([x - 1, y]);
                    stack.push([x, y + 1]); stack.push([x, y - 1]);
                }
            }
        } else {
            // Modo "Global" (Apaga a cor em QUALQUER lugar, limpando buracos - Ex: Guerreiro)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    if (isTargetColor(idx)) {
                        data[idx + 3] = 0;
                    }
                }
            }
        }

        // 2. REFINAMENTO DE BORDAS (Aplica a limpeza de serrilhados em ambos os modos)
        const bordasParaApagar = [];
        const bordasParaSuavizar = [];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                if (data[idx + 3] !== 0) {
                    const vizinhoCima = data[((y - 1) * width + x) * 4 + 3] === 0;
                    const vizinhoBaixo = data[((y + 1) * width + x) * 4 + 3] === 0;
                    const vizinhoEsq = data[(y * width + (x - 1)) * 4 + 3] === 0;
                    const vizinhoDir = data[(y * width + (x + 1)) * 4 + 3] === 0;

                    const numVizinhos = (vizinhoCima?1:0) + (vizinhoBaixo?1:0) + (vizinhoEsq?1:0) + (vizinhoDir?1:0);

                    if (numVizinhos > 0) {
                        const r = data[idx]; const g = data[idx+1]; const b = data[idx+2];
                        const tolExpandida = tolerancia + 70; 
                        
                        if (numVizinhos >= 3 || (Math.abs(r - alvoR) <= tolExpandida && Math.abs(g - alvoG) <= tolExpandida && Math.abs(b - alvoB) <= tolExpandida)) {
                            bordasParaApagar.push(idx);
                        } else {
                            bordasParaSuavizar.push(idx);
                        }
                    }
                }
            }
        }

        for (let idx of bordasParaApagar) data[idx + 3] = 0; 
        for (let idx of bordasParaSuavizar) data[idx + 3] = 140; 

        // 3. GRAVA E ENVIA
        if (img.writeAsync) {
            await img.writeAsync(caminhoFinal);
        } else {
            await new Promise((resolve) => img.write(caminhoFinal, resolve));
        }

        res.download(caminhoFinal, nomeFinal, () => {
            try { fs.unlinkSync(req.file.path); fs.unlinkSync(caminhoFinal); } catch (e) {}
        });

    } catch (e) { 
        console.error("Erro no Removedor de Fundo:", e);
        res.status(500).json({ erro: 'Falha interna ao processar a imagem.' }); 
    }
});

// ==========================================
// LIGAR O MOTOR!
// ==========================================
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 O seu Hub de Ferramentas está online!`);
    console.log(`🌐 Aceda pelo navegador: http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});