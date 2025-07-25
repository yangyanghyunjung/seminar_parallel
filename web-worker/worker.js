self.onmessage = (e) => {
    const { frame, startTime } = e.data;
    const { width, height, data } = frame;
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

    // 처리 완료된 이미지 데이터를 메인 스레드로 전송
    const blurred = new ImageData(out, width, height);
    self.postMessage({ imageData: blurred, startTime });
};