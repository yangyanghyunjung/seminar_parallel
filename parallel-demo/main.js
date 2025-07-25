import pLimit from 'p-limit';

const grid = document.getElementById("grid");
const TOTAL = 40;
const CONCURRENCY_LIMIT = 10;
const REQUEST_LIMIT = 30;
const WINDOW_DURATION = 1000;

let requestCount = 0;
setInterval(() => {
  requestCount = 0;
}, WINDOW_DURATION);

const images = [
  "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop"
];

const mockProducts = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  name: `상품 ${i + 1}`,
  price: `${(Math.floor(Math.random() * 40) + 1) * 1000}원`,
  image: images[i % images.length],
}));

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function renderCard(p) {
  return `
    <div class="card">
      <img src="${p.image}" class="img" />
      <p class="name">${p.name}</p>
      <p class="price">${p.price}</p>
    </div>
  `;
}

function renderSkeleton() {
  return `
    <div class="card animate-pulse">
      <div class="img bg-gray-300"></div>
      <div class="line bg-gray-300 w-3/4"></div>
      <div class="line bg-gray-200 w-1/2"></div>
      <div class="line bg-gray-100 w-1/4"></div>
    </div>
  `;
}

function renderErrorCard(is429 = false) {
  if (is429) {
    return `
      <div class="card error animate-pulse border-2 border-red-500">
        <div class="img bg-red-300"></div>
        <div class="line bg-red-400 w-3/4"></div>
        <div class="line bg-red-300 w-1/2"></div>
        <p class="text-sm text-red-500 mt-2">429: 요청 초과</p>
      </div>
    `;
  }
  return `
    <div class="card error animate-pulse border border-gray-400">
      <div class="img bg-gray-300"></div>
      <div class="line bg-gray-300 w-3/4"></div>
      <div class="line bg-gray-200 w-1/2"></div>
      <p class="text-sm text-gray-500 mt-2">요청 실패</p>
    </div>
  `;
}

function simulateSuccess(i) {
  return new Promise((resolve) => {
    const product = mockProducts[i];
    setTimeout(() => resolve(product), 500);
  });
}

function simulateFail(i) {
  return new Promise((resolve, reject) => {
    const shouldFail = i === 3 || i === 5;
    const product = mockProducts[i];
    setTimeout(() => {
      if (shouldFail) reject(new Error(`상품 ${i + 1} 실패`));
      else resolve(product);
    }, 500);
  });
}

function fetchProduct(i) {
  return new Promise((resolve, reject) => {
    requestCount++;
    console.log(`%c[${i}] 요청, 현재 누적: ${requestCount}`, requestCount > REQUEST_LIMIT ? "color:red" : "color:green");

    if (requestCount > REQUEST_LIMIT) {
      return reject(new Error("429 Too Many Requests"));
    }

    setTimeout(() => {
      resolve(mockProducts[i]);
    }, 200 + Math.random() * 300);
  });
}

// ✅ Promise.all 성공
async function loadAllSuccess() {
  grid.innerHTML = Array(TOTAL).fill("").map(renderSkeleton).join("");
  const products = Array.from({ length: TOTAL }, (_, i) => simulateSuccess(i));
  const results = await Promise.all(products);
  grid.innerHTML = results.map(renderCard).join("");
}

// ✅ Promise.all 실패 (일부 강제 실패)
async function loadWithPromiseAll() {
  grid.innerHTML = Array(TOTAL).fill("").map(renderSkeleton).join("");
  const products = Array.from({ length: TOTAL }, (_, i) => simulateFail(i));
  try {
    const results = await Promise.all(products);
    grid.innerHTML = results.map(renderCard).join("");
  } catch (err) {
    console.error(err);
    await sleep(1000);
    grid.innerHTML = Array(TOTAL).fill("").map(renderSkeleton).join("");
  }
}

// ✅ Promise.allSettled
async function loadWithAllSettled() {
  grid.innerHTML = Array(TOTAL).fill("").map(renderSkeleton).join("");
  const products = Array.from({ length: TOTAL }, (_, i) => simulateFail(i));
  const results = await Promise.allSettled(products);
  grid.innerHTML = results.map(r =>
    r.status === "fulfilled" ? renderCard(r.value) : renderSkeleton()
  ).join("");
}

// ✅ 429 발생 유도 (p-limit 미사용)
async function loadWithoutPLimit() {
  grid.innerHTML = Array(TOTAL).fill("").map(renderSkeleton).join("");
  const children = Array.from(grid.children);

  const tasks = Array.from({ length: TOTAL }, (_, i) =>
    fetchProduct(i)
      .then(data => ({ status: "fulfilled", value: data }))
      .catch(error => ({
        status: "rejected",
        index: i,
        is429: error?.message?.includes("429")
      }))
  );

  const results = await Promise.all(tasks);

  results.forEach((res, i) => {
    const cardHTML = res.status === "fulfilled"
      ? renderCard(res.value)
      : renderErrorCard(res.is429);
    if (children[i]) {
      children[i].outerHTML = cardHTML;
    }
  });
}

// ✅ p-limit 적용 (요청 분산)
async function loadWithPLimit() {
  grid.innerHTML = Array(TOTAL).fill("").map(renderSkeleton).join("");

  const limit = pLimit(CONCURRENCY_LIMIT);
  const tasks = Array.from({ length: TOTAL }, (_, i) =>
    limit(() =>
      sleep(200).then(() => fetchProduct(i))
        .then(data => ({ status: "fulfilled", value: data }))
        .catch(error => ({
          status: "rejected",
          index: i,
          is429: error?.message?.includes("429")
        }))
    )
  );

  const results = await Promise.all(tasks);
  const children = Array.from(grid.children);

  results.forEach((res, i) => {
    const cardHTML = res.status === "fulfilled"
      ? renderCard(res.value)
      : renderErrorCard(res.is429);
    if (children[i]) {
      children[i].outerHTML = cardHTML;
    }
  });
}

// ✅ 버튼 이벤트 등록
document.getElementById("btn-success").onclick = loadAllSuccess;
document.getElementById("btn-all").onclick = loadWithPromiseAll;
document.getElementById("btn-settled").onclick = loadWithAllSettled;
document.getElementById("btn-no-limit").onclick = loadWithoutPLimit;
document.getElementById("btn-plimit").onclick = loadWithPLimit;
