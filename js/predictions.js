// predictions.js
// Handles webcam setup and model predictions

let webcam = null;
let isRunning = false;

/**
 * Setup webcam for image models
 */
async function setupWebcam() {
    const flip = true;
    const width = 400;
    const height = 400;
    
    try {
        webcam = new tmImage.Webcam(width, height, flip);
        await webcam.setup();
        await webcam.play();
        
        isRunning = true;
        window.requestAnimationFrame(loopImage);
        
        document.getElementById('webcam-container').appendChild(webcam.canvas);
    } catch (error) {
        console.error('Error setting up webcam:', error);
        showStatus('modelStatus', 'Error al acceder a la cámara. Verifica los permisos.', 'error');
    }
}

/**
 * Setup webcam for pose models
 */
async function setupPoseWebcam() {
    const size = 400;
    const flip = true;
    
    try {
        webcam = new tmPose.Webcam(size, size, flip);
        await webcam.setup();
        await webcam.play();
        
        isRunning = true;
        window.requestAnimationFrame(loopPose);
        
        // Create canvas for drawing pose
        const canvas = document.createElement('canvas');
        canvas.id = 'pose-canvas';
        canvas.width = size;
        canvas.height = size;
        
        const container = document.getElementById('pose-container');
        container.appendChild(webcam.canvas);
        container.appendChild(canvas);
    } catch (error) {
        console.error('Error setting up pose webcam:', error);
        showStatus('modelStatus', 'Error al acceder a la cámara. Verifica los permisos.', 'error');
    }
}

/**
 * Main loop for image predictions
 */
async function loopImage() {
    if (!isRunning) return;
    
    webcam.update();
    await predictImage();
    window.requestAnimationFrame(loopImage);
}

/**
 * Main loop for pose predictions
 */
async function loopPose() {
    if (!isRunning) return;
    
    webcam.update();
    await predictPose();
    window.requestAnimationFrame(loopPose);
}

/**
 * Make prediction for image model
 */
async function predictImage() {
    const model = getModel();
    if (!model) return;
    
    const prediction = await model.predict(webcam.canvas);
    displayPredictions(prediction);
}

/**
 * Make prediction for pose model
 */
async function predictPose() {
    const model = getModel();
    if (!model) return;
    
    const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
    const prediction = await model.predict(posenetOutput);
    
    displayPredictions(prediction);
    
    // Draw pose on canvas
    const canvas = document.getElementById('pose-canvas');
    if (canvas && pose) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPose(pose, ctx);
    }
}

/**
 * Draw pose keypoints on canvas
 */
function drawPose(pose, ctx) {
    if (pose.keypoints) {
        for (let i = 0; i < pose.keypoints.length; i++) {
            const keypoint = pose.keypoints[i];
            if (keypoint.score > 0.5) {
                ctx.beginPath();
                ctx.arc(keypoint.position.x, keypoint.position.y, 5, 0, 2 * Math.PI);
                ctx.fillStyle = '#667eea';
                ctx.fill();
            }
        }
    }
}

/**
 * Display predictions in UI
 */
function displayPredictions(predictions) {
    const container = document.getElementById('predictions');
    const sorted = predictions.sort((a, b) => b.probability - a.probability);
    
    let html = '';
    sorted.forEach((pred, index) => {
        const confidence = (pred.probability * 100).toFixed(1);
        const isTop = index === 0;
        
        html += `
            <div class="prediction-item ${isTop ? 'top' : ''}">
                <div>
                    <div class="class-name">${pred.className}</div>
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: ${confidence}%"></div>
                    </div>
                </div>
                <div class="confidence">${confidence}%</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Send top prediction to micro:bit if connected
    if (sorted.length > 0 && isConnected()) {
        sendToMicrobit(sorted[0].className, sorted[0].probability * 100);
    }
}

/**
 * Stop predictions and cleanup
 */
function stopPredictions() {
    isRunning = false;
    if (webcam) {
        webcam.stop();
        webcam = null;
    }
}

/**
 * Get running status
 */
function isPredicting() {
    return isRunning;
}

/**
 * Start predicting (called by navigation)
 */
function startPredicting() {
    if (!isRunning && webcam) {
        isRunning = true;
        const modelType = getModelType();
        
        if (modelType === 'image') {
            window.requestAnimationFrame(loopImage);
        } else if (modelType === 'pose') {
            window.requestAnimationFrame(loopPose);
        }
    }
}
