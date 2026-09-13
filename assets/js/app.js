let allBooks = []; 
let fileCounts = {};
let nextToken = null; 
let activeAlpha = 'ALL';
let timeout = null;
let isLoading = false;
let lastLoadAttempt = 0;
let loadError = null;
const bookCardCache = new Map();
const API_URL = 'https://script.google.com/macros/s/AKfycbwjF3QXJUZ8KeVSAwd7fj3-iC4Ectb6As-9r2z633CATaz4EMEO4NG_ZDE5Y1Xwv9qNjg/exec';
const PDF_PROXY_URL = 'https://nurul-ilmi-pdf-proxy.mail-iqrapetobo.workers.dev';
const API_TIMEOUT_MS = 15000;
let pageFlip = null;
let readerBook = null;
let readerZoom = 1;
const pdfCache = new Map();
const activeRenderTasks = new Set();
const activeLoadingTasks = new Set();
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let raceTimeoutId;

    try {
        const response = await Promise.race([
            fetch(`${API_URL}?${query}`, { signal: controller.signal })
                .then(response => {
                    if (!response.ok) throw new Error(`API error: ${response.status}`);
                    return response.json();
                }),
            new Promise((resolve, reject) => {
                raceTimeoutId = setTimeout(() => reject(new Error(`API timeout: ${action}`)), API_TIMEOUT_MS);
            })
        ]);
        return response;
    } finally {
        clearTimeout(timeoutId);
        clearTimeout(raceTimeoutId);
    }
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
    if (isLoading || Date.now() - lastLoadAttempt < 2000) return;
    isLoading = true;
    lastLoadAttempt = Date.now();
    loadError = null;
    const bottomLoader = document.getElementById('bottomLoader');
    bottomLoader.innerHTML = '<div class="w-10 h-10 border-4 border-green-200 border-t-custom rounded-full animate-spin"></div>';
    if (allBooks.length > 0) bottomLoader.classList.remove('hidden');

    try {
        const params = nextToken ? { token: nextToken } : {};
        const response = await requestApi('files', params);
        allBooks = allBooks.concat(response.files || []).map(book => ({
            ...book,
            searchName: book.searchName || book.name.toLocaleLowerCase()
        }));
        allBooks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        nextToken = response.nextToken;
        render();
    } catch (error) {
        console.error('Gagal memuat daftar buku:', error);
        loadError = 'Gagal memuat buku berikutnya. Geser lagi untuk mencoba.';
        const bottomLoader = document.getElementById('bottomLoader');
        bottomLoader.innerHTML = `<span class="text-sm font-bold text-gray-400">${loadError}</span>`;
        bottomLoader.classList.remove('hidden');
        render();
    } finally {
        isLoading = false;
        document.getElementById('loader').classList.add('hidden');
        if (!loadError) document.getElementById('bottomLoader').classList.add('hidden');
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

function createBookCard(book) {
    const readCount = fileCounts[book.id] || 0;
    const cleanName = book.name.replace(/'/g, "\\'");
    const template = document.createElement('template');

    template.innerHTML = `
        <div class="book-card p-5 flex flex-col h-full animate-fade-in shadow-sm bg-white border-b-4 border-green-500">
            <div class="h-56 bg-green-50/50 rounded-2xl mb-5 flex items-center justify-center overflow-hidden border border-green-50 relative">
                <img src="${book.thumbnail}" loading="lazy" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/400x300?text=No+Cover'">
                <div class="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-extrabold text-custom shadow-sm border border-green-100 flex items-center gap-1.5">
                    <i class="fa-solid fa-eye text-xs"></i>
                    <span id="count-${book.id}">${readCount}</span>x dibaca
                </div>
            </div>
            <h3 class="font-bold text-gray-800 text-base line-clamp-2 mb-5 flex-grow leading-snug">${book.name}</h3>
            <div class="flex items-center justify-between mt-auto">
                <span class="px-3 py-1 bg-gray-100 rounded-full text-[10px] text-gray-500 font-bold uppercase tracking-wider">${book.size}</span>
                <button type="button" onclick="openReader('${book.id}', '${cleanName}')" class="bg-custom hover:bg-[#15805a] text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-md shadow-green-100">BACA</button>
            </div>
        </div>`;

    return template.content.firstElementChild;
}

function render() {
    const container = document.getElementById('fileContainer');
    const search = document.getElementById('searchInput').value.trim().toLocaleLowerCase();
    let visibleCount = 0;

    const matchingCards = [];
    allBooks.forEach(book => {
        let card = bookCardCache.get(book.id);
        if (!card) {
            card = createBookCard(book);
            bookCardCache.set(book.id, card);
        }

        const matchesSearch = book.searchName.includes(search);
        const matchesAlpha = activeAlpha === 'ALL' || book.name.toUpperCase().startsWith(activeAlpha);
        if (matchesSearch && matchesAlpha) {
            card.hidden = false;
            visibleCount++;
            matchingCards.push(card);
        }
    });

    if (visibleCount === 0 && (!isLoading || search)) {
        const emptyMessage = search && (isLoading || nextToken)
            ? 'Mencari di seluruh koleksi buku...'
            : 'Buku tidak ditemukan.';
        if (container.children.length !== 1 || container.firstElementChild.textContent !== emptyMessage) {
            container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400 font-bold">${emptyMessage}</div>`;
        }
    } else {
        matchingCards.forEach((card, index) => {
            if (container.children[index] !== card) {
                container.insertBefore(card, container.children[index] || null);
            }
        });
        while (container.children.length > matchingCards.length) {
            container.lastElementChild.remove();
        }
    }

    if (search && nextToken && !isLoading) {
        fetchNextBatch();
    } else if (!search && visibleCount < 8 && nextToken && !isLoading) {
        fetchNextBatch();
    }
}

async function openReader(fileId, fileName) {
    const book = allBooks.find(item => item.id === fileId);
    if (!book) return;

    cancelReaderWork();
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
        status.textContent = 'Mengambil PDF...';
        const pdf = await loadPdf(book.id);
        if (currentSession !== readerSession) return;

        const pageElements = Array.from({ length: pdf.numPages }, () => {
            const pageElement = document.createElement('div');
            pageElement.className = 'flip-page';
            pageElement.appendChild(document.createElement('canvas'));
            return pageElement;
        });

        status.textContent = 'Merender halaman pertama...';
        await renderPdfPage(pdf, 1, pageElements[0]);
        if (currentSession !== readerSession) return;

        const flipContainer = ensureFlipContainer();
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
        pageFlip.on('flip', event => {
            updatePageIndicator(event.data, pdf.numPages);
            preloadNearbyPages(pdf, pageElements, event.data, currentSession);
        });
        updatePageIndicator(0, pdf.numPages);
        status.hidden = true;
        viewport.hidden = false;
        controls.hidden = false;

        preloadNearbyPages(pdf, pageElements, 0, currentSession);
    } catch (error) {
        if (currentSession !== readerSession) return;
        console.error('Gagal membuka PDF:', error);
        status.textContent = 'Buku tidak dapat ditampilkan. Pastikan file PDF dapat diakses publik, lalu coba lagi.';
        document.getElementById('driveFallback').classList.add('is-primary');
        controls.hidden = false;
    }
}

function ensureFlipContainer() {
    let flipContainer = document.getElementById('bookPageFlip');
    if (flipContainer) return flipContainer;

    flipContainer = document.createElement('div');
    flipContainer.id = 'bookPageFlip';
    flipContainer.className = 'book-page-flip';
    document.getElementById('bookViewport').appendChild(flipContainer);
    return flipContainer;
}

async function loadPdf(fileId) {
    if (pdfCache.has(fileId)) return pdfCache.get(fileId);

    if (PDF_PROXY_URL) {
        const proxyUrl = `${PDF_PROXY_URL}?fileId=${encodeURIComponent(fileId)}`;
        let loadingTask = null;
        try {
            loadingTask = pdfjsLib.getDocument({
                url: proxyUrl,
                rangeChunkSize: 1048576,
                disableStream: false,
                disableAutoFetch: false
            });
            activeLoadingTasks.add(loadingTask);
            const proxyPdf = await loadingTask.promise;
            activeLoadingTasks.delete(loadingTask);
            pdfCache.set(fileId, Promise.resolve(proxyPdf));
            return proxyPdf;
        } catch (error) {
            if (loadingTask) activeLoadingTasks.delete(loadingTask);
            pdfCache.delete(fileId);
            console.warn('Proxy PDF gagal, mencoba fallback Apps Script:', error);
        }
    }

    return loadPdfFromAppsScript(fileId);
}

async function loadPdfFromAppsScript(fileId) {
    const cachedPdf = await loadPdfFromBrowserCache(fileId);
    if (cachedPdf) return cachedPdf;
    const cacheKey = `https://pdf-cache.local/${encodeURIComponent(fileId)}`;

    const pdfResponse = await requestApi('pdf', { fileId });
    if (pdfResponse.error || !pdfResponse.data) {
        throw new Error(pdfResponse.error || 'Data PDF kosong.');
    }

    const encodedPdf = atob(pdfResponse.data);
    const binaryPdf = new Uint8Array(encodedPdf.length);
    for (let index = 0; index < encodedPdf.length; index++) binaryPdf[index] = encodedPdf.charCodeAt(index);

    if ('caches' in window) {
        const cache = await caches.open('nurul-ilmi-pdf-v1');
        await cache.put(cacheKey, new Response(binaryPdf, {
            headers: { 'Content-Type': 'application/pdf' }
        }));
    }

    const loadingTask = pdfjsLib.getDocument({ data: binaryPdf });
    activeLoadingTasks.add(loadingTask);
    const pdfPromise = loadingTask.promise;
    pdfPromise.then(
        () => activeLoadingTasks.delete(loadingTask),
        () => activeLoadingTasks.delete(loadingTask)
    );
    pdfCache.set(fileId, pdfPromise);
    pdfPromise.catch(() => pdfCache.delete(fileId));
    return pdfPromise;
}

async function loadPdfFromBrowserCache(fileId) {
    if (!('caches' in window)) return null;

    const cacheKey = `https://pdf-cache.local/${encodeURIComponent(fileId)}`;
    const cache = await caches.open('nurul-ilmi-pdf-v1');
    const cachedResponse = await cache.match(cacheKey);
    if (!cachedResponse) return null;

    const cachedBytes = new Uint8Array(await cachedResponse.arrayBuffer());
    const cachedPdf = pdfjsLib.getDocument({ data: cachedBytes }).promise;
    pdfCache.set(fileId, cachedPdf);
    return cachedPdf;
}

function renderPdfPage(pdf, pageNumber, pageElement) {
    if (pageElement.dataset.rendered === 'true') return Promise.resolve();
    if (pageElement.renderPromise) return pageElement.renderPromise;

    pageElement.renderPromise = (async () => {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxHeight = window.innerWidth < 640 ? 760 : 900;
        const cssScale = Math.min(1.5, maxHeight / baseViewport.height);
        const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
        const viewportSize = page.getViewport({ scale: cssScale });
        const renderScale = Math.min(cssScale * pixelRatio, 4096 / Math.max(baseViewport.width, baseViewport.height));
        const renderViewport = page.getViewport({ scale: renderScale });
        const canvas = pageElement.querySelector('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${Math.ceil(viewportSize.width)}px`;
        canvas.style.height = `${Math.ceil(viewportSize.height)}px`;
        const renderTask = page.render({ canvasContext: context, viewport: renderViewport });
        activeRenderTasks.add(renderTask);
        try {
            await renderTask.promise;
            pageElement.dataset.rendered = 'true';
        } finally {
            activeRenderTasks.delete(renderTask);
        }
    })().finally(() => {
        pageElement.renderPromise = null;
    });

    return pageElement.renderPromise;
}

function preloadNearbyPages(pdf, pageElements, currentPageIndex, session) {
    const pageNumbers = [currentPageIndex, currentPageIndex + 1, currentPageIndex + 2]
        .filter(pageIndex => pageIndex >= 0 && pageIndex < pageElements.length)
        .map(pageIndex => pageIndex + 1);

    Promise.all(pageNumbers.map(pageNumber => renderPdfPage(pdf, pageNumber, pageElements[pageNumber - 1])))
        .catch(error => {
            if (session === readerSession) console.error('Gagal memuat halaman:', error);
        });
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
    cancelReaderWork();
    const modal = document.getElementById('readerModal');
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('reader-open');
    pageFlip?.destroy();
    pageFlip = null;
    document.getElementById('bookPageFlip')?.replaceChildren();
}

function cancelReaderWork() {
    activeRenderTasks.forEach(task => {
        try { task.cancel(); } catch (error) { console.warn('Render task cleanup gagal:', error); }
    });
    activeRenderTasks.clear();
    activeLoadingTasks.forEach(task => {
        try { task.destroy(); } catch (error) { console.warn('PDF task cleanup gagal:', error); }
    });
    activeLoadingTasks.clear();
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
    if (nextToken && !isLoading && Date.now() - lastLoadAttempt >= 2000) {
        fetchNextBatch();
    }
    }
};