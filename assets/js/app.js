let allBooks = []; 
let fileCounts = {};
let nextToken = null; 
let activeAlpha = 'ALL';
let timeout = null;
let isLoading = false;
const API_URL = 'https://script.google.com/macros/s/AKfycbwjF3QXJUZ8KeVSAwd7fj3-iC4Ectb6As-9r2z633CATaz4EMEO4NG_ZDE5Y1Xwv9qNjg/exec';
let pageFlip = null;
let readerBook = null;
let readerZoom = 1;
const pdfCache = new Map();
let readerSession = 0;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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

window.onload = () => {
    fetchNextBatch();

    Promise.all([requestApi('visitor'), requestApi('counts')])
        .then(([visitor, counts]) => {
            document.getElementById('visitorCounter').innerText = parseInt(visitor.count, 10).toLocaleString('id-ID');
            fileCounts = counts || {};
            render();
        })
        .catch(error => {
            console.error('Gagal memuat statistik:', error);
        });
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
            <button type="button" onclick="openReader('${b.id}', '${cleanName}')" class="bg-custom hover:bg-[#15805a] text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-md shadow-green-100">BACA</button>
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

async function openReader(fileId, fileName) {
    const book = allBooks.find(item => item.id === fileId);
    if (!book) return;

    const currentSession = ++readerSession;
    readerBook = book;
    resetReaderZoom();
    trackClick(fileId, fileName);
    const modal = document.getElementById('readerModal');
    const viewport = document.getElementById('bookViewport');
    const controls = document.getElementById('readerControls');
    const status = document.getElementById('readerStatus');
    document.getElementById('readerTitle').textContent = book.name;
    document.getElementById('driveFallback').href = book.url;
    viewport.hidden = true;
    controls.hidden = true;
    status.hidden = false;
    status.textContent = 'Menyiapkan halaman...';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('reader-open');

    try {
        const pdf = await loadPdf(book.id);
        if (currentSession !== readerSession) return;

        const pageElements = Array.from({ length: pdf.numPages }, () => {
            const pageElement = document.createElement('div');
            pageElement.className = 'flip-page';
            pageElement.appendChild(document.createElement('canvas'));
            return pageElement;
        });

        await renderPdfPage(pdf, 1, pageElements[0]);
        if (currentSession !== readerSession) return;

        const flipContainer = document.getElementById('bookPageFlip');
        flipContainer.replaceChildren(...pageElements);
        pageFlip?.destroy();
        pageFlip = new St.PageFlip(flipContainer, {
            width: 460,
            height: 650,
            size: 'stretch',
            minWidth: 280,
            maxWidth: 460,
            minHeight: 396,
            maxHeight: 650,
            showCover: true,
            maxShadowOpacity: 0.35,
            mobileScrollSupport: false
        });
        pageFlip.loadFromHTML(pageElements);
        pageFlip.on('flip', event => updatePageIndicator(event.data, pdf.numPages));
        updatePageIndicator(0, pdf.numPages);
        status.hidden = true;
        viewport.hidden = false;
        controls.hidden = false;

        renderRemainingPages(pdf, pageElements, currentSession);
    } catch (error) {
        console.error('Gagal membuka PDF:', error);
        status.textContent = 'Buku tidak dapat ditampilkan. Pastikan file PDF dapat diakses publik, lalu coba lagi.';
        document.getElementById('driveFallback').classList.add('is-primary');
        controls.hidden = false;
    }
}

async function loadPdf(fileId) {
    if (pdfCache.has(fileId)) return pdfCache.get(fileId);

    const pdfResponse = await requestApi('pdf', { fileId });
    if (pdfResponse.error || !pdfResponse.data) {
        throw new Error(pdfResponse.error || 'Data PDF kosong.');
    }

    const encodedPdf = atob(pdfResponse.data);
    const binaryPdf = new Uint8Array(encodedPdf.length);
    for (let index = 0; index < encodedPdf.length; index++) {
        binaryPdf[index] = encodedPdf.charCodeAt(index);
    }

    const pdfPromise = pdfjsLib.getDocument({ data: binaryPdf }).promise;
    pdfCache.set(fileId, pdfPromise);
    return pdfPromise;
}

async function renderPdfPage(pdf, pageNumber, pageElement) {
    if (pageElement.dataset.rendered === 'true') return;

    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxHeight = window.innerWidth < 640 ? 600 : 720;
    const scale = Math.min(1.5, maxHeight / baseViewport.height);
    const viewportSize = page.getViewport({ scale });
    const canvas = pageElement.querySelector('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = viewportSize.width;
    canvas.height = viewportSize.height;
    await page.render({ canvasContext: context, viewport: viewportSize }).promise;
    pageElement.dataset.rendered = 'true';
}

async function renderRemainingPages(pdf, pageElements, session) {
    let nextPage = 2;
    const workerCount = Math.min(4, pageElements.length - 1);

    async function renderWorker() {
        while (nextPage <= pageElements.length && session === readerSession) {
            const pageNumber = nextPage++;
            await renderPdfPage(pdf, pageNumber, pageElements[pageNumber - 1]);
        }
    }

    await Promise.all(Array.from({ length: workerCount }, renderWorker));
}

function updatePageIndicator(pageIndex, totalPages) {
    document.getElementById('pageIndicator').textContent = `${pageIndex + 1} / ${totalPages}`;
}

function flipPrevious() {
    pageFlip?.flipPrev();
}

function flipNext() {
    pageFlip?.flipNext();
}

function zoomReader(change) {
    readerZoom = Math.min(1.6, Math.max(0.8, readerZoom + change));
    document.getElementById('bookPageFlip').style.setProperty('--reader-zoom', readerZoom.toFixed(1));
    document.getElementById('zoomIndicator').textContent = `${Math.round(readerZoom * 100)}%`;
}

function resetReaderZoom() {
    readerZoom = 1;
    const pageFlipElement = document.getElementById('bookPageFlip');
    if (pageFlipElement) pageFlipElement.style.setProperty('--reader-zoom', '1');
    const zoomIndicator = document.getElementById('zoomIndicator');
    if (zoomIndicator) zoomIndicator.textContent = '100%';
}

function closeReader() {
    readerSession++;
    const modal = document.getElementById('readerModal');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('reader-open');
    pageFlip?.destroy();
    pageFlip = null;
    document.getElementById('bookPageFlip').replaceChildren();
}

document.getElementById('readerModal').addEventListener('click', event => {
    if (event.target.id === 'readerModal') closeReader();
});

document.addEventListener('keydown', event => {
    if (!document.getElementById('readerModal').classList.contains('is-open')) return;
    if (event.key === 'Escape') closeReader();
    if (event.key === 'ArrowLeft') flipPrevious();
    if (event.key === 'ArrowRight') flipNext();
});

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