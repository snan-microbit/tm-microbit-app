/**
 * predictions.js
 * Handles webcam and predictions
 */

import { getModel, getModelType } from './model-loader.js';
import { sendToMicrobit, isConnected } from './bluetooth.js';

let webcam = null;
let isRunning = false;
let audioContext = null;
let analyser = null;
let microphone = null;

/**
 * Start predictions
 */
async function startPredictions() {
    const modelType = getModelType();
    
    if (modelType === 'image') {
        await setupWebcam();
    } else if (modelType === 'pose') {
        await setupPoseWebcam();
    } else if (modelType === 'audio') {
        await setupAudio();
    }
    
    isRunning = true;
}

/**
 * Stop predictions
 */
function stopPredictions() {
    isRunning = false;
    if (webcam) {
        webcam.stop();
        webcam = null;
    }
    if (microphone) {
        microphone.getTracks().forEach(track => track.stop());
        microphone = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

/**
 * Setup webcam for image models
 */
async function setupWebcam() {
    try {
        webcam = new window.tmImage.Webcam(400, 400, true);
        await webcam.setup();
        await webcam.play();
        
        document.getElementById('webcam-wrapper').appendChild(webcam.canvas);
        window.requestAnimationFrame(loopImage);
    } catch (error) {
        console.error('Webcam error:', error);
        throw error;
    }
}

/**
 * Setup webcam for pose models
 */
async function setupPoseWebcam() {
    try {
        webcam = new window.tmPose.Webcam(400, 400, true);
        await webcam.setup();
        await webcam.play();
        
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        
        const wrapper = document.getElementById('webcam-wrapper');
        wrapper.appendChild(webcam.canvas);
        wrapper.appendChild(canvas);
        
        window.requestAnimationFrame(loopPose);
    } catch (error) {
        console.error('Pose webcam error:', error);
        throw error;
    }
}

/**
 * Setup audio for audio models
 */
async function setupAudio() {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = stream;
        
        // Setup audio context and analyser
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        // Create canvas for visualization
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        canvas.id = 'audio-visualizer';
        
        const wrapper = document.getElementById('webcam-wrapper');
        wrapper.innerHTML = ''; // Clear any existing content
        wrapper.appendChild(canvas);
        
        // Start audio predictions and visualization
        const model = getModel();
        await model.listen(result => {
            displayPredictions(result);
        }, { probabilityThreshold: 0.5 });
        
        window.requestAnimationFrame(visualizeAudio);
    } catch (error) {
        console.error('Audio setup error:', error);
        throw error;
    }
}

/**
 * Visualize audio as bars (like music equalizer)
 */
function visualizeAudio() {
    if (!isRunning || !analyser) return;
    
    const canvas = document.getElementById('audio-visualizer');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyser.getByteFrequencyData(dataArray);
    
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barCount = 32; // Number of bars
    const barWidth = (canvas.width / barCount) * 0.8;
    const barGap = (canvas.width / barCount) * 0.2;
    
    for (let i = 0; i < barCount; i++) {
        // Average frequency data for this bar
        const start = Math.floor((i * bufferLength) / barCount);
        const end = Math.floor(((i + 1) * bufferLength) / barCount);
        let sum = 0;
        for (let j = start; j < end; j++) {
            sum += dataArray[j];
        }
        const average = sum / (end - start);
        
        const barHeight = (average / 255) * canvas.height * 0.8;
        const x = i * (barWidth + barGap) + barGap / 2;
        const y = canvas.height - barHeight;
        
        // Gradient from turquoise to blue
        const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
        gradient.addColorStop(0, '#009f95');
        gradient.addColorStop(1, '#4169B8');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
    }
    
    window.requestAnimationFrame(visualizeAudio);
}

/**
 * Image prediction loop
 */
async function loopImage() {
    if (!isRunning || !webcam) return;
    
    webcam.update();
    await predictImage();
    window.requestAnimationFrame(loopImage);
}

/**
 * Pose prediction loop
 */
async function loopPose() {
    if (!isRunning || !webcam) return;
    
    webcam.update();
    await predictPose();
    window.requestAnimationFrame(loopPose);
}

/**
 * Predict for image model
 */
async function predictImage() {
    const model = getModel();
    if (!model || !webcam) return;
    
    const prediction = await model.predict(webcam.canvas);
    displayPredictions(prediction);
}

/**
 * Predict for pose model
 */
async function predictPose() {
    const model = getModel();
    if (!model || !webcam) return;
    
    const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
    const prediction = await model.predict(posenetOutput);
    
    // Draw pose
    const canvas = document.getElementById('webcam-wrapper').querySelectorAll('canvas')[1];
    if (canvas && pose) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (pose.keypoints) {
            drawPose(pose, ctx);
        }
    }
    
    displayPredictions(prediction);
}

/**
 * Draw pose skeleton
 */
function drawPose(pose, ctx) {
    if (!pose.keypoints) return;
    
    // Draw keypoints
    pose.keypoints.forEach(keypoint => {
        if (keypoint.score > 0.5) {
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#00ff00';
            ctx.fill();
        }
    });
    
    // Draw skeleton
    const skeleton = [
        [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
        [5, 11], [6, 12], [11, 12],
        [11, 13], [13, 15], [12, 14], [14, 16]
    ];
    
    skeleton.forEach(([i, j]) => {
        const kp1 = pose.keypoints[i];
        const kp2 = pose.keypoints[j];
        
        if (kp1.score > 0.5 && kp2.score > 0.5) {
            ctx.beginPath();
            ctx.moveTo(kp1.position.x, kp1.position.y);
            ctx.lineTo(kp2.position.x, kp2.position.y);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

/**
 * Display predictions in UI
 */
function displayPredictions(predictions) {
    const container = document.getElementById('predictions');
    if (!container) return;
    
    // Sort by confidence
    const sorted = predictions.slice().sort((a, b) => b.probability - a.probability);
    
    // Display top predictions
    container.innerHTML = sorted.map((pred, index) => {
        const percentage = (pred.probability * 100).toFixed(1);
        const isTop = index === 0;
        
        return `
            <div class="prediction-item ${isTop ? 'top' : ''}">
                <div class="prediction-header">
                    <span class="class-name">${pred.className}</span>
                    <span class="confidence">${percentage}%</span>
                </div>
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Send top prediction to micro:bit if connected
    if (isConnected() && sorted.length > 0) {
        const top = sorted[0];
        sendToMicrobit(top.className, top.probability * 100);
    }
}

/**
 * Handle page visibility
 */
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.warn('⏸️ Page hidden - predictions paused');
    } else {
        console.log('▶️ Page visible - predictions resumed');
        if (isRunning) {
            const modelType = getModelType();
            if (modelType === 'image' && webcam) {
                window.requestAnimationFrame(loopImage);
            } else if (modelType === 'pose' && webcam) {
                window.requestAnimationFrame(loopPose);
            } else if (modelType === 'audio' && analyser) {
                window.requestAnimationFrame(visualizeAudio);
            }
        }
    }
});

export { startPredictions, stopPredictions };