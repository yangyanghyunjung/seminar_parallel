// DOM 요소 가져오기
const video = document.getElementById('video');
const workerCanvas = document.getElementById('workerCanvas');
const nonworkerCanvas = document.getElementById('nonworkerCanvas');
const workerCtx = workerCanvas.getContext('2d');
const nonworkerCtx = nonworkerCanvas.getContext('2d');

const graphWorker = document.getElementById('graphWorker');
const graphNonWorker = document.getElementById('graphNonWorker');
const graphCtxW = graphWorker.getContext('2d');
const graphCtxN = graphNonWorker.getContext('2d');

const workerStats = document.getElementById('workerStats');
const nonworkerStats = document.getElementById('nonworkerStats');

// Web Worker 생성
const worker = new Worker('worker.js');

// 상수 설정
const canvasWidth = 540;
const canvasHeight = 304;

// 성능 측정 변수
let frameTimesW = [], frameTimesN = [];
let lastW = performance.now(), lastN = performance.now();
let countW = 0, countN = 0;

/**
 * 성능 그래프를 그리는 함수
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {number[]} frameTimes - 프레임 처리 시간 배열
 * @param {string} color - 그래프 선 색상
 * @param {number} width - 그래프 너비
 * @param {number} height - 그래프 높이
 */
function drawGraph(ctx, frameTimes, color, width = 540, height = 90) {
    ctx.clearRect(0, 0, width, height);

    const recent = frameTimes.slice(-width);
    if (recent.length === 0) return;

    // 평균 계산
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    // 표준편차 계산
    const variance = recent.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / recent.length;
    const stdDev = Math.sqrt(variance);

    const avgY = height - Math.min(height, avg);
    const stdTopY = height - Math.min(height, avg + stdDev);
    const stdBotY = height - Math.min(height, avg - stdDev);

    // 표준편차 영역 먼저 그리기
    ctx.fillStyle = 'rgba(255, 165, 0, 0.15)';
    ctx.fillRect(0, stdTopY, width, stdBotY - stdTopY);

    // 그래프 선 그리기
    ctx.beginPath();
    ctx.moveTo(0, height - Math.min(height, recent[0]));
    recent.forEach((t, i) => {
        const y = Math.min(height, t);
        ctx.lineTo(i, height - y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 평균선 그리기
    ctx.beginPath();
    ctx.moveTo(0, avgY);
    ctx.lineTo(width, avgY);
    ctx.strokeStyle = 'gold';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
}

/**
 * 메인 스레드에서 블러 효과를 적용하는 함수
 * @param {ImageData} imageData - 원본 이미지 데이터
 * @returns {ImageData} 블러 처리된 이미지 데이터
 */
function applyStrongBlur(imageData) {
    const { width, height, data } = imageData;
    const copy = new Uint8ClampedArray(data);
    const out = new Uint8ClampedArray(data.length);

    const kernelSize = 5;
    const half = Math.floor(kernelSize / 2);

    // 블러 효과 적용
    for (let y = half; y < height - half; y++) {
        for (let x = half; x < width - half; x++) {
            let r = 0, g = 0, b = 0;

            // 커널 영역의 픽셀들 평균값 계산
            for (let dy = -half; dy <= half; dy++) {
                for (let dx = -half; dx <= half; dx++) {
                    const i = ((y + dy) * width + (x + dx)) * 4;
                    r += copy[i];
                    g += copy[i + 1];
                    b += copy[i + 2];
                }
            }

            const count = kernelSize * kernelSize;
            const idx = (y * width + x) * 4;
            out[idx] = r / count;
            out[idx + 1] = g / count;
            out[idx + 2] = b / count;
            out[idx + 3] = copy[idx + 3]; // alpha 값 유지
        }
    }

    return new ImageData(out, width, height);
}

/**
 * 통계 정보를 업데이트하는 함수
 * @param {HTMLElement} statsElement - 통계를 표시할 DOM 요소
 * @param {number} avgTime - 평균 처리 시간
 * @param {number} fps - FPS 값
 */
function updateStats(statsElement, avgTime, fps) {
    statsElement.innerHTML = `
        <div>처리 시간: ${avgTime.toFixed(1)} ms</div>
        <div>FPS: ${fps.toFixed(1)}</div>
    `;
}

// 비디오 재생 시작 시 프레임 처리 시작
video.addEventListener('play', () => {
    const drawFrame = () => {
        if (video.paused || video.ended) return;

        // 공통 원본 프레임 가져오기
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
        const frame = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);

        // Web Worker 처리
        const startW = performance.now();
        worker.postMessage({
            frame: new ImageData(new Uint8ClampedArray(frame.data), canvasWidth, canvasHeight),
            startTime: startW,
        });

        // Non-Worker 처리 (메인 스레드)
        const startN = performance.now();
        const frameN = new ImageData(new Uint8ClampedArray(frame.data), canvasWidth, canvasHeight);
        const resultN = applyStrongBlur(frameN);
        nonworkerCtx.putImageData(resultN, 0, 0);

        const elapsedN = performance.now() - startN;
        frameTimesN.push(elapsedN);

        // Non-Worker 성능 통계 업데이트
        countN++;
        const nowN = performance.now();
        if (nowN - lastN >= 1000) {
            const fpsN = (countN / (nowN - lastN)) * 1000;
            const avgN = frameTimesN.slice(-60).reduce((a, b) => a + b, 0) / Math.min(frameTimesN.length, 60);
            updateStats(nonworkerStats, avgN, fpsN);
            countN = 0;
            lastN = nowN;
        }

        // Non-Worker 그래프 업데이트
        drawGraph(graphCtxN, frameTimesN, '#cc0000');

        requestAnimationFrame(drawFrame);
    };

    drawFrame();
});

// Web Worker 메시지 처리
worker.onmessage = (e) => {
    const { imageData, startTime } = e.data;
    const elapsedW = performance.now() - startTime;

    // Worker 결과를 캔버스에 그리기
    workerCtx.putImageData(imageData, 0, 0);
    frameTimesW.push(elapsedW);

    // Worker 성능 통계 업데이트
    countW++;
    const nowW = performance.now();
    if (nowW - lastW >= 1000) {
        const fpsW = (countW / (nowW - lastW)) * 1000;
        const avgW = frameTimesW.slice(-60).reduce((a, b) => a + b, 0) / Math.min(frameTimesW.length, 60);
        updateStats(workerStats, avgW, fpsW);
        countW = 0;
        lastW = nowW;
    }

    // Worker 그래프 업데이트
    drawGraph(graphCtxW, frameTimesW, '#0077cc');
};