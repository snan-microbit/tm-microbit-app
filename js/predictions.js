/**
 * predictions.js
 * Handles webcam and predictions
 */

import { getModel, getModelType } from './model-loader.js';
import { sendToMicrobit, isConnected } from './bluetooth.js';

let webcam = null;
let isRunning = false;

/**
 * Start predictions
 */
async function startPredictions() {
    const modelType = getModelType();
    
    if (modelType === 'image') {
        await setupWebcam();
    } else if (modelType === 'pose') {
        await setupPoseWebcam();
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
        if (isRunning && webcam) {
            const modelType = getModelType();
            if (modelType === 'image') {
                window.requestAnimationFrame(loopImage);
            } else if (modelType === 'pose') {
                window.requestAnimationFrame(loopPose);
            }
        }
    }
});

export { startPredictions, stopPredictions };