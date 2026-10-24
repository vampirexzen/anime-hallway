// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://brvyjdtnxzjlrhukngjn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJydnlqZHRueHpqbHJodWtuZ2puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTAwMjcsImV4cCI6MjEwODA4NjAyN30.2ib-m3ju3SEhJLaQHQdA8xinenbtN5MltOatIYZSZIE';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- GLOBAL APP STATE ---
let currentUser = null;
let userProfile = null;
let activeChatTab = 'global';
let activeDMRecipient = null;
let parkPlayers = {};
let marketplaceItems = [
    // Skins (500 to 15,000 Pts)
    { id: 'pink_sakura', name: 'Sakura Pink Slime', type: 'skin', price: 500, color: '#ffb7c5', glow: null },
    { id: 'mint_leaf', name: 'Mint Leaf Slime', type: 'skin', price: 1500, color: '#98ff98', glow: null },
    { id: 'golden_glow', name: 'Golden Aura Slime', type: 'skin', price: 7500, color: '#ffd700', glow: '#ffea00' },
    { id: 'icy_cosmic', name: 'Cosmic Ice Slime', type: 'skin', price: 15000, color: '#00ffff', glow: '#00ffff' },
    // Accessories
    { id: 'hat_cap', name: 'Cherry Cap', type: 'accessory', price: 800, icon: '🧢' },
    { id: 'spiky_hair', name: 'Spiky Hair', type: 'accessory', price: 2000, icon: '🦔' },
    { id: 'bow_tie', name: 'Fancy Bowtie', type: 'accessory', price: 3500, icon: '🎀' },
    // Titles
    { id: 'title_bloomer', name: 'Sakura Bloomer', type: 'title', price: 1000, titleText: 'Sakura Bloomer' },
    { id: 'title_legend', name: 'Park Legend', type: 'title', price: 10000, titleText: 'Park Legend' },
    // Frames
    { id: 'frame_blossom', name: 'Blossom Border', type: 'frame', price: 1200, borderStyle: '3px solid #ffb7c5' }
];
let selectedMarketItem = null;
let activeMarketTab = 'skins';

// Game Canvas Engine Variables
let canvas, ctx;
let playerX = 400, playerY = 300, playerVelocityY = 0, isJumping = false, bounceOffset = 0;
let keysPressed = {};

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    setupEventListeners();
    startPassivePointsTimer();
});

function initCanvas() {
    canvas = document.getElementById('parkCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    const wrapper = canvas.parentElement;
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
}

// --- AUTHENTICATION MODULE ---
function switchAuthMode(mode) {
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('auth-btn').innerText = mode === 'login' ? 'Enter Sakura Park' : 'Create Account';
    document.getElementById('auth-form').dataset.mode = mode;
}

async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const mode = document.getElementById('auth-form').dataset.mode || 'login';
    const errorDiv = document.getElementById('auth-error');
    errorDiv.innerText = '';

    if (!username || !password) return;

    if (mode === 'signup') {
        const { data: existing } = await supabaseClient.from('profiles').select('id').eq('username', username).single();
        if (existing) return errorDiv.innerText = 'Username already exists.';

        const { data, error } = await supabaseClient.from('profiles').insert([{ username, password_hash: password }]).select().single();
        if (error) return errorDiv.innerText = error.message;
        
        userProfile = data;
        finishLogin();
    } else {
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('username', username).eq('password_hash', password).single();
        if (error || !data) return errorDiv.innerText = 'Invalid username or password.';
        if (data.is_banned) return errorDiv.innerText = 'This account has been banned.';

        userProfile = data;
        finishLogin();
    }
}

function finishLogin() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    updateUIProfile();
    setupRealtimeSubscriptions();
    fetchFriendsList();
    fetchGlobalMessages();
}

function handleSignOut() {
    location.reload();
}

function updateUIProfile() {
    document.getElementById('header-points').innerHTML = `<i class="fa-solid fa-coins"></i> ${userProfile.points} Pts`;
    document.getElementById('profile-display-name').innerText = userProfile.username;
    document.getElementById('profile-title').innerText = userProfile.equipped_title || 'Cherry Novice';
    document.getElementById('profile-role-badge').innerText = userProfile.role.toUpperCase();
    document.getElementById('profile-avatar-img').src = userProfile.avatar_url;
    
    // Toggle Admin/Dev Specific Panels
    const isDev = userProfile.role === 'developer';
    const isAdmin = userProfile.role === 'admin' || isDev;
    document.getElementById('dev-panel-btn').classList.toggle('hidden', !isAdmin);
    document.getElementById('admin-skin-toggle').classList.toggle('hidden', userProfile.role !== 'admin');
    document.getElementById('dev-only-controls').classList.toggle('hidden', !isDev);
}

// --- REALTIME PRESENCE & CHAT MODULE ---
function setupRealtimeSubscriptions() {
    // Park Presence Channel
    const presenceChannel = supabaseClient.channel('park_room');
    
    presenceChannel.on('broadcast', { event: 'player_move' }, ({ payload }) => {
        parkPlayers[payload.user_id] = payload;
    }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            broadcastMovement();
        }
    });

    // Global Chat Realtime
    supabaseClient.channel('global_chat_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat' }, payload => {
            appendGlobalMessage(payload.new);
        }).subscribe();

    // Direct Messages Realtime
    supabaseClient.channel('dm_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, payload => {
            if (payload.new.receiver_id === userProfile.id || payload.new.sender_id === userProfile.id) {
                appendDMMessage(payload.new);
            }
        }).subscribe();
}

function broadcastMovement(speech = '', emote = '') {
    supabaseClient.channel('park_room').send({
        type: 'broadcast',
        event: 'player_move',
        payload: {
            user_id: userProfile.id,
            username: userProfile.username,
            role: userProfile.role,
            x: playerX,
            y: playerY,
            skin: userProfile.equipped_skin,
            accessory: userProfile.equipped_accessory,
            title: userProfile.equipped_title,
            speech_bubble: speech,
            emote: emote
        }
    });
}

// --- CANVAS GAME LOOP & GRAPHICS ---
function gameLoop() {
    updatePlayerMovement();
    renderPark();
    requestAnimationFrame(gameLoop);
}

function updatePlayerMovement() {
    const speed = 4;
    let moved = false;

    if (keysPressed['ArrowUp'] || keysPressed['KeyW']) { playerY -= speed; moved = true; }
    if (keysPressed['ArrowDown'] || keysPressed['KeyS']) { playerY += speed; moved = true; }
    if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) { playerX -= speed; moved = true; }
    if (keysPressed['ArrowRight'] || keysPressed['KeyD']) { playerX += speed; moved = true; }

    if (moved) {
        bounceOffset = Math.abs(Math.sin(Date.now() / 100)) * 10;
        broadcastMovement();
    } else {
        bounceOffset = 0;
    }

    if (isJumping) {
        playerY -= playerVelocityY;
        playerVelocityY -= 0.8;
        if (playerVelocityY < -10) { isJumping = false; }
    }
}

function renderPark() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render Sakura Blossom Park Background
    ctx.fillStyle = '#2b1736';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw decorative Sakura Trees
    ctx.fillStyle = '#ffb7c5';
    ctx.beginPath(); ctx.arc(100, 100, 60, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(canvas.width - 100, 120, 80, 0, Math.PI * 2); ctx.fill();

    // Render Self Slime
    drawSlime(playerX, playerY - bounceOffset, userProfile.equipped_skin, userProfile.equipped_accessory, userProfile.username, userProfile.equipped_title, userProfile.role);

    // Render Other Realtime Players
    Object.values(parkPlayers).forEach(p => {
        if (p.user_id !== userProfile.id) {
            drawSlime(p.x, p.y, p.skin, p.accessory, p.username, p.title, p.role, p.speech_bubble, p.emote);
        }
    });
}

function drawSlime(x, y, skinId, accessoryId, username, title, role, speech = '', emote = '') {
    ctx.save();
    
    // Check Glow / Aura
    let skinData = marketplaceItems.find(i => i.id === skinId) || { color: '#ffb7c5' };
    
    if (role === 'developer') {
        skinData = { color: '#ffffff', glow: '#00ffff' };
        title = 'DEV';
    } else if (role === 'admin' && skinId === 'admin_black') {
        skinData = { color: '#111111', glow: '#ff0000' };
        title = 'Admin';
    }

    if (skinData.glow) {
        ctx.shadowColor = skinData.glow;
        ctx.shadowBlur = 15;
    }

    // Draw Slime Body
    ctx.fillStyle = skinData.color;
    ctx.beginPath();
    ctx.ellipse(x, y, 25, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x - 8, y - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 8, y - 4, 3, 0, Math.PI * 2); ctx.fill();

    // Draw Accessories
    if (accessoryId === 'hat_cap') { ctx.fillText('🧢', x - 8, y - 20); }
    if (accessoryId === 'spiky_hair') { ctx.fillText('🦔', x - 8, y - 20); }
    if (accessoryId === 'bow_tie') { ctx.fillText('🎀', x - 8, y + 10); }

    // Draw Username and Title
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    if (title) {
        ctx.fillStyle = role === 'developer' ? '#00ffff' : (role === 'admin' ? '#ff3333' : '#ffb7c5');
        ctx.fillText(`[${title}]`, x, y - 35);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillText(username, x, y - 22);

    // Draw Speech Bubble
    if (speech) {
        ctx.fillStyle = 'white';
        ctx.fillRect(x - 40, y - 60, 80, 20);
        ctx.fillStyle = 'black';
        ctx.fillText(speech, x, y - 46);
    }

    ctx.restore();
}

// --- CONTROLS LISTENERS ---
function setupEventListeners() {
    window.addEventListener('keydown', e => keysPressed[e.code] = true);
    window.addEventListener('keyup', e => keysPressed[e.code] = false);

    document.getElementById('jump-btn').addEventListener('click', () => {
        if (!isJumping) { isJumping = true; playerVelocityY = 10; }
    });
}

// --- CHAT SYSTEM ---
async function sendGlobalMessage() {
    if (userProfile.is_muted) return alert('You are currently muted.');
    const input = document.getElementById('global-input');
    const msg = input.value.trim();
    if (!msg) return;

    await supabaseClient.from('global_chat').insert([{
        user_id: userProfile.id,
        username: userProfile.username,
        role: userProfile.role,
        message: msg
    }]);
    input.value = '';
}

function appendGlobalMessage(data) {
    const list = document.getElementById('global-messages');
    const div = document.createElement('div');
    div.className = `chat-msg ${data.role}`;
    div.innerHTML = `<span class="sender" onclick="openUserAction('${data.username}')">${data.username}:</span> ${data.message}`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

// --- FRIENDS & DM SYSTEM ---
async function fetchFriendsList() {
    const { data } = await supabaseClient.from('friendships')
        .select('user2_id, profiles!friendships_user2_id_fkey(username)')
        .eq('user1_id', userProfile.id);

    const listDiv = document.getElementById('friends-list');
    listDiv.innerHTML = '';
    (data || []).forEach(f => {
        const item = document.createElement('div');
        item.className = 'form-group inline';
        item.innerHTML = `
            <span>${f.profiles.username}</span>
            <button class="btn-secondary" onclick="startDM('${f.user2_id}', '${f.profiles.username}')">DM</button>
            <button class="btn-primary" style="background:#cc0000;" onclick="removeFriend('${f.user2_id}')">Unfriend</button>
        `;
        listDiv.appendChild(item);
    });
}

async function searchAndAddFriend() {
    const name = document.getElementById('search-user-input').value.trim();
    const { data: target } = await supabaseClient.from('profiles').select('id, username').eq('username', name).single();
    if (!target) return alert('User not found.');

    await supabaseClient.from('friendships').insert([{ user1_id: userProfile.id, user2_id: target.id }]);
    alert(`Added ${target.username} as friend!`);
    fetchFriendsList();
}

async function removeFriend(targetId) {
    await supabaseClient.from('friendships').delete().eq('user1_id', userProfile.id).eq('user2_id', targetId);
    fetchFriendsList();
}

function startDM(userId, username) {
    activeDMRecipient = { id: userId, username };
    document.getElementById('dm-target-name').innerText = `DM with ${username}`;
    document.getElementById('dm-input').disabled = false;
    document.getElementById('dm-send-btn').disabled = false;
    switchChatTab('dm');
}

async function sendDirectMessage() {
    if (!activeDMRecipient) return;
    const input = document.getElementById('dm-input');
    const msg = input.value.trim();
    if (!msg) return;

    await supabaseClient.from('direct_messages').insert([{
        sender_id: userProfile.id,
        receiver_id: activeDMRecipient.id,
        message: msg
    }]);
    input.value = '';
}

function appendDMMessage(data) {
    const list = document.getElementById('dm-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="sender">${data.sender_id === userProfile.id ? 'Me' : activeDMRecipient.username}:</span> ${data.message}`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

// --- MARKETPLACE MODULE ---
function switchMarketTab(tab) {
    activeMarketTab = tab;
    renderMarketCatalog();
}

function renderMarketCatalog() {
    const grid = document.getElementById('market-items-grid');
    grid.innerHTML = '';
    const filtered = marketplaceItems.filter(i => i.type === activeMarketTab.slice(0, -1) || i.type === activeMarketTab);

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = `market-item-card ${selectedMarketItem?.id === item.id ? 'selected' : ''}`;
        card.innerHTML = `<h4>${item.name}</h4><p>${item.price} Pts</p>`;
        card.onclick = () => {
            selectedMarketItem = item;
            renderMarketCatalog();
            document.getElementById('preview-item-name').innerText = item.name;
            document.getElementById('preview-item-price').innerText = `${item.price} Pts`;
            document.getElementById('buy-item-btn').disabled = false;
        };
        grid.appendChild(card);
    });
}

async function buySelectedItem() {
    if (!selectedMarketItem) return;
    if (userProfile.points < selectedMarketItem.price) return alert('Not enough points!');

    const newPoints = userProfile.points - selectedMarketItem.price;
    await supabaseClient.from('profiles').update({
        points: newPoints,
        [`equipped_${selectedMarketItem.type}`]: selectedMarketItem.id
    }).eq('id', userProfile.id);

    userProfile.points = newPoints;
    userProfile[`equipped_${selectedMarketItem.type}`] = selectedMarketItem.id;
    updateUIProfile();
    alert(`Purchased ${selectedMarketItem.name}!`);
}

// --- PASSIVE POINTS & MINIGAMES ---
function startPassivePointsTimer() {
    setInterval(async () => {
        if (userProfile) {
            userProfile.points += 1;
            await supabaseClient.from('profiles').update({ points: userProfile.points }).eq('id', userProfile.id);
            updateUIProfile();
        }
    }, 15 * 60 * 1000); // 15 Minutes
}

// --- DEVELOPER & ADMIN CONTROLS ---
function toggleDevMode(enable) {
    const code = document.getElementById('dev-passcode-input').value;
    if (enable && code === '1357') {
        userProfile.role = 'developer';
        alert('Developer Mode Activated!');
    } else if (!enable) {
        userProfile.role = 'user';
        alert('Developer Mode Deactivated!');
    } else {
        return alert('Incorrect Passcode');
    }
    updateUIProfile();
    broadcastMovement();
}

async function adminAction(actionType) {
    const targetName = document.getElementById('admin-target-username').value.trim();
    if (!targetName) return;

    if (actionType === 'make_admin') {
        await supabaseClient.from('profiles').update({ role: 'admin' }).eq('username', targetName);
    } else if (actionType === 'revoke_admin') {
        await supabaseClient.from('profiles').update({ role: 'user' }).eq('username', targetName);
    } else if (actionType === 'ban') {
        await supabaseClient.from('profiles').update({ is_banned: true }).eq('username', targetName);
    } else if (actionType === 'unban') {
        await supabaseClient.from('profiles').update({ is_banned: false }).eq('username', targetName);
    } else if (actionType === 'delete') {
        await supabaseClient.from('profiles').delete().eq('username', targetName);
    }
    alert(`Action ${actionType} performed on ${targetName}`);
}

async function adminSendPoints() {
    const targetName = document.getElementById('admin-target-username').value.trim();
    const amount = parseInt(document.getElementById('admin-points-amount').value);
    
    const { data: target } = await supabaseClient.from('profiles').select('points').eq('username', targetName).single();
    if (target) {
        await supabaseClient.from('profiles').update({ points: target.points + amount }).eq('username', targetName);
        alert(`Updated ${targetName}'s points by ${amount}`);
    }
}

// UI HELPER FUNCTIONS
function toggleModal(modalId) {
    document.getElementById(modalId).classList.toggle('hidden');
}

function switchChatTab(tab) {
    document.getElementById('global-chat-panel').classList.toggle('hidden', tab !== 'global');
    document.getElementById('dm-chat-panel').classList.toggle('hidden', tab !== 'dm');
    document.getElementById('tab-global-chat').classList.toggle('active', tab === 'global');
    document.getElementById('tab-dm-chat').classList.toggle('active', tab === 'dm');
}
