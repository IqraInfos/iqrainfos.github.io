let allBooks = []; 
let fileCounts = {};
let nextToken = null; 
let activeAlpha = 'ALL';
let timeout = null;
let isLoading = false;
const API_URL = 'https://script.google.com/macros/s/AKfycbwjF3QXJUZ8KeVSAwd7fj3-iC4Ectb6As-9r2z633CATaz4EMEO4NG_ZDE5Y1Xwv9qNjg/exec';

const alphaContainer = document.getElementById('alphaContainer');
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(l => {
    alphaContainer.innerHTML += `<button onclick="setFilter('${l}')" class="px-4 py-2 rounded-xl bg-white border border-gray-100 text-[#1ca170] font-bold text-sm hover:bg-[#1ca170] hover:text-white uppercase transition-all shadow-sm">${l}</button>`;
});

function toggleFilter() {
    const section = document.getElementById('filterSection');
    const icon = document.getElementById('filterIcon');
    section.classList.toggle('hidden-filter');
    icon.className = section.classList.contains('hidden-filter') ? 'fa-solid fa-filter text-xl' : 'fa-solid fa-filter-circle-xmark text-xl';
}

async function requestApi(action, params = {}) {
    const query = new URLSearchParams({ action, ...params });
    const response = await fetch(`${API_URL}?${query}`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
}

window.onload = async () => {
    try {
        const [visitor, counts] = await Promise.all([
            requestApi('visitor'),
            requestApi('counts')
        ]);
        document.getElementById('visitorCounter').innerText = parseInt(visitor.count, 10).toLocaleString('id-ID');
        fileCounts = counts || {};
        fetchNextBatch();
    } catch (error) {
        console.error('Gagal memuat data:', error);
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('fileContainer').innerHTML = '<div class="col-span-full text-center py-10 text-red-400 font-bold">Data gagal dimuat. Silakan coba lagi.</div>';
    }
};

async function fetchNextBatch() {
    if (isLoading) return;
    isLoading = true;
    if (allBooks.length > 0) document.getElementById('bottomLoader').classList.remove('hidden');

    try {
        const params = nextToken ? { token: nextToken } : {};
        const response = await requestApi('files', params);
        allBooks = allBooks.concat(response.files || []);
        allBooks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        nextToken = response.nextToken;
        render();
    } catch (error) {
        console.error('Gagal memuat daftar buku:', error);
    } finally {
        isLoading = false;
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('bottomLoader').classList.add('hidden');
    }
}

function debounceFilter() {
    clearTimeout(timeout);
    timeout = setTimeout(render, 300);
}

function setFilter(l) {
    activeAlpha = l;
    render();
}

function render() {
    const container = document.getElementById('fileContainer');
    const search = document.getElementById('searchInput').value.toLowerCase();
    
    const filtered = allBooks.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(search);
    const matchesAlpha = activeAlpha === 'ALL' || b.name.toUpperCase().startsWith(activeAlpha);
    return matchesSearch && matchesAlpha;
    });

    if (filtered.length === 0 && !nextToken && !isLoading) {
    container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 font-bold">Buku tidak ditemukan.</div>`;
    } else {
    const html = filtered.map(b => {
        const readCount = fileCounts[b.id] || 0;
        const cleanName = b.name.replace(/'/g, "\\'");

        return `
        <div class="book-card p-5 flex flex-col h-full animate-fade-in shadow-sm bg-white border-b-4 border-green-500">
            <div class="h-56 bg-green-50/50 rounded-2xl mb-5 flex items-center justify-center overflow-hidden border border-green-50 relative">
                <img src="${b.thumbnail}" loading="lazy" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/400x300?text=No+Cover'">
                
                <!-- BADGE TOTAL DIBACA -->
                <div class="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-extrabold text-custom shadow-sm border border-green-100 flex items-center gap-1.5">
                <i class="fa-solid fa-eye text-xs"></i>
                <span id="count-${b.id}">${readCount}</span>x dibaca
                </div>
            </div>
            <h3 class="font-bold text-gray-800 text-base line-clamp-2 mb-5 flex-grow leading-snug">${b.name}</h3>
            <div class="flex items-center justify-between mt-auto">
            <span class="px-3 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500 font-bold uppercase tracking-wider">${b.size}</span>
            <a href="${b.url}" target="_blank" onclick="trackClick('${b.id}', '${cleanName}')" class="bg-custom hover:bg-[#15805a] text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-md shadow-green-100">BACA</a>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;
    }

    if (filtered.length < 8 && nextToken && !isLoading) {
    fetchNextBatch();
    }
}

function trackClick(fileId, fileName) {
    fileCounts[fileId] = (fileCounts[fileId] || 0) + 1;
    const countEl = document.getElementById(`count-${fileId}`);
    if (countEl) countEl.innerText = fileCounts[fileId];

    requestApi('log', { fileId, fileName }).catch(error => {
        console.error('Gagal mencatat klik buku:', error);
    });
}

window.onscroll = () => {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 800) {
    if (nextToken && !isLoading) {
        fetchNextBatch();
    }
    }
};