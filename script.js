// DOM elements
const video = document.getElementById('videoPlayer');
const audio = document.getElementById('audioPlayer');
const audioContainer = document.getElementById('audioPlayerContainer');
const channelsGrid = document.getElementById('channelsGrid');
const filterBtns = document.querySelectorAll('.filter-btn');
const groupSelect = document.getElementById('groupSelect');
const nowPlayingFooter = document.getElementById('nowPlayingFooter');
const playerArea = document.getElementById('playerArea');
const channelsPanel = document.getElementById('channelsPanel');
const appContainer = document.getElementById('appContainer');

// State
let channels = [];
let activeCategory = 'all';
let activeGroup = 'all';
let selectedChannel = null;
let shakaPlayer = null;
let hlsPlayer = null;

// Fullscreen state tracking
let isFullscreen = false;
let clickCount = 0;
let clickTimer = null;
let keyCount = 0;
let keyTimer = null;

// ---------- LOAD CHANNELS FROM JSON ----------
async function loadChannels() {
    try {
        const response = await fetch('channels.json');
        channels = await response.json();
        renderGrid();
        if (channels.length) {
            playChannel(channels[0]);
        }
    } catch (error) {
        console.error('Failed to load channels:', error);
        nowPlayingFooter.innerText = '⚠️ Failed to load channels';
    }
}

// ---------- HELPER: stop all players ----------
function stopAllPlayers() {
    if (shakaPlayer) {
        shakaPlayer.destroy().catch(()=>{});
        shakaPlayer = null;
    }
    if (hlsPlayer) {
        hlsPlayer.destroy();
        hlsPlayer = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audioContainer.style.display = 'none';
}

// ---------- PLAY CHANNEL (unmuted) ----------
function playChannel(ch) {
    stopAllPlayers();
    selectedChannel = ch;

    video.volume = 1.0;
    video.muted = false;
    audio.volume = 1.0;

    nowPlayingFooter.innerText = `▶ Now: ${ch.name} (${ch.category})`;

    const uri = ch.manifestUri;

    if (ch.type === 'mp3') {
        audioContainer.style.display = 'flex';
        audio.src = uri;
        audio.play().catch(e => console.warn('audio play failed', e));
        return;
    }

    audioContainer.style.display = 'none';

    if (ch.type === 'hls') {
        if (Hls.isSupported()) {
            hlsPlayer = new Hls();
            hlsPlayer.loadSource(uri);
            hlsPlayer.attachMedia(video);
            hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                video.muted = false;
                video.play().catch(e => console.warn('autoplay prevented', e));
            });
            hlsPlayer.on(Hls.Events.ERROR, (err, data) => {
                console.warn('HLS error', data);
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = uri;
            video.muted = false;
            video.play().catch(e => console.warn('safari hls play', e));
        } else {
            alert('HLS not supported');
        }
        return;
    }

    if (ch.type === 'dash') {
        shakaPlayer = new shaka.Player(video);
        if (ch.drm && ch.drm.type === 'org.w3.clearkey' && ch.drm.keyIds) {
            const clearKeys = {};
            for (let kid in ch.drm.keyIds) {
                const cleanKid = kid.replace(/-/g, '').toLowerCase();
                const cleanKey = ch.drm.keyIds[kid].replace(/-/g, '').toLowerCase();
                clearKeys[cleanKid] = cleanKey;
            }
            shakaPlayer.configure({ drm: { clearKeys: clearKeys } });
        }
        shakaPlayer.load(uri).then(() => {
            video.muted = false;
            video.play().catch(e => console.warn('shaka play', e));
        }).catch(err => {
            console.error('DASH error', err);
            nowPlayingFooter.innerText = '⚠️ DASH error, see console';
        });
    }
}

// ---------- RENDER CHANNEL GRID ----------
function renderGrid() {
    if (!channels.length) return;
    
    const filtered = channels.filter(ch => {
        if (activeCategory !== 'all' && ch.category !== activeCategory) return false;
        if (activeGroup !== 'all' && (!ch.groups || !ch.groups.includes(activeGroup))) return false;
        return true;
    });

    channelsGrid.innerHTML = '';
    filtered.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card' + (selectedChannel === ch ? ' selected' : '');
        card.innerHTML = `
            <img class="channel-logo" src="${ch.logo}" loading="lazy" onerror="this.src='https://via.placeholder.com/65x65/222233/aaa?text=📡'">
            <div class="channel-name">${ch.name}</div>
            <div class="channel-badge">${ch.type}</div>
        `;
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            playChannel(ch);
            renderGrid();
        });
        channelsGrid.appendChild(card);
    });
}

// ---------- FILTER HANDLERS ----------
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat;
        renderGrid();
    });
});

groupSelect.addEventListener('change', (e) => {
    activeGroup = e.target.value;
    renderGrid();
});

// ---------- TOGGLE CHANNEL PANEL (single click/tap) ----------
function toggleChannelsPanel() {
    if (window.matchMedia("(orientation: landscape)").matches) {
        channelsPanel.classList.toggle('visible');
    }
}

// ---------- TOGGLE FULLSCREEN (double click/tap or double Enter/Space) ----------
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (appContainer.requestFullscreen) {
            appContainer.requestFullscreen();
        } else if (appContainer.webkitRequestFullscreen) {
            appContainer.webkitRequestFullscreen();
        } else if (appContainer.msRequestFullscreen) {
            appContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// Handle double-click for fullscreen
playerArea.addEventListener('click', (e) => {
    if (e.target.closest('#audioPlayerContainer')) return;
    
    clickCount++;
    if (clickCount === 1) {
        clickTimer = setTimeout(() => {
            toggleChannelsPanel();
            clickCount = 0;
        }, 250);
    } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        toggleFullscreen();
        clickCount = 0;
    }
});

// Handle double Enter/Space for fullscreen
playerArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        
        keyCount++;
        if (keyCount === 1) {
            keyTimer = setTimeout(() => {
                toggleChannelsPanel();
                keyCount = 0;
            }, 250);
        } else if (keyCount === 2) {
            clearTimeout(keyTimer);
            toggleFullscreen();
            keyCount = 0;
        }
    }
});

// ---------- INITIALIZE ----------
shaka.polyfill.installAll();
loadChannels(); // Load channels from external JSON

audioContainer.addEventListener('click', e => e.stopPropagation());

// Track fullscreen changes
document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
});
document.addEventListener('webkitfullscreenchange', () => {
    isFullscreen = !!document.webkitFullscreenElement;
});
document.addEventListener('msfullscreenchange', () => {
    isFullscreen = !!document.msFullscreenElement;
});
