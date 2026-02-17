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
    
    isRunning = true; // Set to true BEFORE setup
    
    if (modelType === 'image') {
        await setupWebcam();
    } else if (modelType === 'pose') {
        await setupPoseWebcam();
    } else if (modelType === 'audio') {
        await setupAudio();
    }
}

/**
 * Stop predictions
 */
function stopPredictions() {
    isRunning = false;
    
    // Stop webcam
    if (webcam) {
        webcam.stop();
        webcam = null;
    }
    
    // Stop audio
    if (microphone) {
        microphone.getTracks().forEach(track => track.stop());
        microphone = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    // Stop audio model listening
    const model = getModel();
    const modelType = getModelType();
    if (model && modelType === 'audio' && model.stopListening) {
        model.stopListening();
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
        console.log('🎤 Configurando audio...');
        
        // Create canvas for visualization
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        canvas.id = 'audio-visualizer';
        
        const wrapper = document.getElementById('webcam-wrapper');
        wrapper.innerHTML = ''; // Clear any existing content
        wrapper.appendChild(canvas);
        
        // Setup audio context and analyser for visualization
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = stream;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        // Start visualization
        window.requestAnimationFrame(visualizeAudio);
        
        // Start audio predictions
        const model = getModel();
        console.log('🎤 Iniciando escucha de audio...');
        
        // Start listening
        await model.listen(result => {
            console.log('🎤 Audio result:', result);
            
            // Convert result to predictions format
            // result.scores is a Float32Array
            const wordLabels = model.wordLabels();
            console.log('📝 Word labels:', wordLabels);
            
            if (!result.scores) {
                console.error('❌ result.scores no existe:', result);
                return;
            }
            
            // Convert Float32Array to regular array
            const scoresArray = Array.from(result.scores);
            console.log('📈 Scores array:', scoresArray);
            
            const predictions = scoresArray.map((score, i) => {
                const className = wordLabels[i] || `Clase ${i}`;
                const probability = typeof score === 'number' ? score : 0;
                
                return {
                    className: className,
                    probability: probability
                };
            });
            
            console.log('📊 Predictions:', predictions);
            displayPredictions(predictions);
        }, {
            includeSpectrogram: false,
            probabilityThreshold: 0.5,
            invokeCallbackOnNoiseAndUnknown: true,
            overlapFactor: 0.5
        });
        
        console.log('✅ Audio configurado correctamente');
        console.log('🎨 Visualización iniciada - isRunning:', isRunning, 'analyser:', !!analyser, 'canvas:', !!document.getElementById('audio-visualizer'));
    } catch (error) {
        console.error('Audio setup error:', error);
        throw error;
    }
}

/**
 * Visualize audio as bars (like music equalizer)
 */
function visualizeAudio() {
    if (!isRunning || !analyser) {
        console.log('⚠️ Visualización detenida - isRunning:', isRunning, 'analyser:', !!analyser);
        return;
    }
    
    const canvas = document.getElementById('audio-visualizer');
    if (!canvas) {
        console.warn('⚠️ Canvas audio-visualizer no encontrado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyser.getByteFrequencyData(dataArray);
    
    // Clear canvas with same background as container (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barCount = 32; // Number of bars
    const barWidth = (canvas.width / barCount) * 0.9; // Wider bars (0.9 instead of 0.7)
    const barGap = (canvas.width / barCount) * 0.1;   // Smaller gap (0.1 instead of 0.3)
    const borderRadius = barWidth / 2; // Rounded ends
    
    // Calculate total width of bars area
    const totalBarsWidth = barCount * (barWidth + barGap);
    const startX = barGap / 2;
    const endX = startX + totalBarsWidth - barGap;
    
    // Draw center line only where bars are
    const centerY = canvas.height / 2;
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, centerY);
    ctx.lineTo(endX, centerY);
    ctx.stroke();
    
    // Focus on vocal range: ~80Hz to 8000Hz
    // Assuming sample rate of 44100 Hz, Nyquist frequency is 22050 Hz
    // Each bin represents: 22050 / bufferLength Hz
    const binFrequency = 22050 / bufferLength;
    const minFreq = 80;    // Hz - lowest vocal frequency
    const maxFreq = 8000;  // Hz - upper vocal range
    
    const minBin = Math.floor(minFreq / binFrequency);
    const maxBin = Math.floor(maxFreq / binFrequency);
    const usefulBins = maxBin - minBin;
    
    for (let i = 0; i < barCount; i++) {
        // Map bar to frequency range (80Hz - 8000Hz)
        const start = minBin + Math.floor((i * usefulBins) / barCount);
        const end = minBin + Math.floor(((i + 1) * usefulBins) / barCount);
        
        // Average frequency data for this bar
        let sum = 0;
        for (let j = start; j < end; j++) {
            sum += dataArray[j];
        }
        const average = sum / (end - start);
        
        // Calculate bar height (half goes up, half goes down)
        // Amplify visualization for better visibility
        const fullBarHeight = (average / 255) * canvas.height * 0.85;
        const halfBarHeight = fullBarHeight / 2;
        
        const x = i * (barWidth + barGap) + barGap / 2;
        
        // Draw bar going UP from center
        const yUp = centerY - halfBarHeight;
        drawRoundedBar(ctx, x, yUp, barWidth, halfBarHeight, borderRadius, true);
        
        // Draw bar going DOWN from center
        const yDown = centerY;
        drawRoundedBar(ctx, x, yDown, barWidth, halfBarHeight, borderRadius, false);
    }
    
    window.requestAnimationFrame(visualizeAudio);
}

/**
 * Draw a rounded bar with gradient
 */
function drawRoundedBar(ctx, x, y, width, height, radius, isUp) {
    if (height < 2) return; // Don't draw very small bars
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, isUp ? y : y, 0, isUp ? y + height : y + height);
    gradient.addColorStop(0, '#009f95');
    gradient.addColorStop(1, '#4169B8');
    
    ctx.fillStyle = gradient;
    
    // Draw rounded rectangle
    ctx.beginPath();
    
    if (isUp) {
        // Bar going UP - rounded top
        ctx.moveTo(x, y + height);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.lineTo(x + width, y + radius);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.lineTo(x + width, y + height);
    } else {
        // Bar going DOWN - rounded bottom
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + height - radius);
        ctx.arcTo(x, y + height, x + width, y + height, radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width, y, radius);
        ctx.lineTo(x + width, y);
    }
    
    ctx.closePath();
    ctx.fill();
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
    
    // Validar que las predicciones sean válidas
    if (!predictions || !Array.isArray(predictions)) {
        console.error('❌ Predictions inválidas:', predictions);
        return;
    }
    
    // Filtrar predicciones con valores inválidos
    const validPredictions = predictions.filter(pred => {
        return pred.className && 
               typeof pred.probability === 'number' && 
               !isNaN(pred.probability) &&
               isFinite(pred.probability);
    });
    
    if (validPredictions.length === 0) {
        console.warn('⚠️ No hay predicciones válidas');
        return;
    }
    
    // Sort by confidence
    const sorted = validPredictions.slice().sort((a, b) => b.probability - a.probability);
    
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