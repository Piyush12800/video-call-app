// Socket connection
const socket = io();

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createRoomButton = document.getElementById('createRoom');
const joinRoomButton = document.getElementById('joinRoom');
const roomIdInput = document.getElementById('roomIdInput');
const roomSelection = document.getElementById('room-selection');
const videoCallSection = document.getElementById('video-call');
const toggleVideoButton = document.getElementById('toggleVideo');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleEmotionButton = document.getElementById('toggleEmotion');
const leaveRoomButton = document.getElementById('leaveRoom');

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Global variables
let localStream;
let peerConnection;
let roomID;
let isVideoEnabled = true;
let isAudioEnabled = true;
let isEmotionDetectionRunning = false;
const emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];

// Emotion Detection Functions
async function loadModels() {
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
            faceapi.nets.faceExpressionNet.loadFromUri('/models')
        ]);
        console.log('Face detection models loaded');
        return true;
    } catch (error) {
        console.error('Error loading face detection models:', error);
        return false;
    }
}

function createEmotionMeters() {
    const container = document.getElementById('emotion-meters');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Create separate sections for local and remote emotions
    const localSection = document.createElement('div');
    localSection.innerHTML = '<h4>Local User Emotions</h4>';
    const remoteSection = document.createElement('div');
    remoteSection.innerHTML = '<h4>Remote User Emotions</h4>';
    
    emotions.forEach(emotion => {
        // Local emotion meters
        const localMeterDiv = document.createElement('div');
        localMeterDiv.className = 'emotion-meter';
        localMeterDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>${emotion}</span>
                <span id="local-${emotion}-value">0%</span>
            </div>
            <div class="emotion-bar" id="local-${emotion}-bar" style="width: 0%"></div>
        `;
        localSection.appendChild(localMeterDiv);
        
        // Remote emotion meters
        const remoteMeterDiv = document.createElement('div');
        remoteMeterDiv.className = 'emotion-meter';
        remoteMeterDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>${emotion}</span>
                <span id="remote-${emotion}-value">0%</span>
            </div>
            <div class="emotion-bar" id="remote-${emotion}-bar" style="width: 0%"></div>
        `;
        remoteSection.appendChild(remoteMeterDiv);
    });
    
    container.appendChild(localSection);
    container.appendChild(remoteSection);
}

function updateEmotionMeters(expressions, isLocal = true) {
    const prefix = isLocal ? 'local' : 'remote';
    emotions.forEach(emotion => {
        const value = Math.round(expressions[emotion] * 100);
        const bar = document.getElementById(`${prefix}-${emotion}-bar`);
        const valueDisplay = document.getElementById(`${prefix}-${emotion}-value`);
        if (bar && valueDisplay) {
            bar.style.width = `${value}%`;
            valueDisplay.textContent = `${value}%`;
        }
    });
}

async function detectEmotions(video, overlay, isLocal = true) {
    if (!video.srcObject || !isEmotionDetectionRunning) return;
    
    try {
        const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();
            
        if (detection) {
            const dominantEmotion = Object.entries(detection.expressions)
                .reduce((a, b) => (a[1] > b[1] ? a : b))[0];
            overlay.textContent = `Emotion: ${dominantEmotion}`;
            updateEmotionMeters(detection.expressions, isLocal);
            
            if (isLocal) {
                socket.emit('emotion-data', { 
                    roomID, 
                    emotions: detection.expressions 
                });
            }
        }
        
        if (isEmotionDetectionRunning) {
            requestAnimationFrame(() => detectEmotions(video, overlay, isLocal));
        }
    } catch (error) {
        console.error('Error detecting emotions:', error);
    }
}

async function startEmotionDetection() {
    const modelsLoaded = await loadModels();
    if (!modelsLoaded) {
        alert('Failed to load emotion detection models');
        return;
    }
    
    createEmotionMeters();
    isEmotionDetectionRunning = true;
    
    detectEmotions(
        document.getElementById('localVideo'),
        document.getElementById('localEmotion'),
        true
    );
}

async function setupMediaStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Failed to access camera and microphone. Please check permissions.');
        return false;
    }
}

createRoomButton.addEventListener('click', async () => {
    const success = await setupMediaStream();
    if (success) {
        roomID = Math.random().toString(36).substring(2, 7);
        socket.emit('join-room', roomID);
        alert(`Your Room ID is: ${roomID}`);
        startCall();
    }
});

joinRoomButton.addEventListener('click', async () => {
    roomID = roomIdInput.value.trim();
    if (roomID === '') {
        alert('Please enter a valid Room ID');
        return;
    }
    const success = await setupMediaStream();
    if (success) {
        socket.emit('join-room', roomID);
        startCall();
    }
});

// This function will check if emotion detection module is loaded before calling it
async function startCall() {
    roomSelection.style.display = 'none';
    videoCallSection.style.display = 'block';
    
    // Check if emotion detection is available
    if (typeof window.startEmotionDetection === 'function') {
        await window.startEmotionDetection();
    } else {
        console.warn('Emotion detection not available');
        // Hide emotion-related elements if the feature isn't available
        const emotionStats = document.getElementById('emotion-stats');
        const toggleEmotionButton = document.getElementById('toggleEmotion');
        if (emotionStats) emotionStats.style.display = 'none';
        if (toggleEmotionButton) toggleEmotionButton.style.display = 'none';
    }
}

socket.on('user-connected', async (userID) => {
    console.log('User connected:', userID);
    try {
        await createPeerConnection();
        await addLocalTracks();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { roomID, signal: offer });
    } catch (error) {
        console.error('Error during connection:', error);
        alert('Failed to establish connection. Please try again.');
    }
});

socket.on('signal', async ({ signal, senderID }) => {
    try {
        if (!peerConnection) {
            await createPeerConnection();
        }

        if (signal.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
            await addLocalTracks();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { roomID, signal: answer });
        } 
        else if (signal.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        } 
        else if (signal.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
        }
    } catch (error) {
        console.error('Error handling signal:', error);
    }
});

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('signal', { 
                roomID, 
                signal: event.candidate 
            });
        }
    };

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
    };
}
socket.on('emotion-data', (data) => {
    const remoteOverlay = document.getElementById('remoteEmotion');
    const dominantEmotion = Object.entries(data.emotions)
        .reduce((a, b) => (a[1] > b[1] ? a : b))[0];
    remoteOverlay.textContent = `Emotion: ${dominantEmotion}`;
    updateEmotionMeters(data.emotions, false);
});
async function addLocalTracks() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

toggleVideoButton.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled;
            videoTrack.enabled = isVideoEnabled;
            toggleVideoButton.textContent = isVideoEnabled ? 'Toggle Video' : 'Enable Video';
        }
    }
});

toggleAudioButton.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            toggleAudioButton.textContent = isAudioEnabled ? 'Toggle Audio' : 'Enable Audio';
        }
    }
});

leaveRoomButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    videoCallSection.style.display = 'none';
    roomSelection.style.display = 'block';
    stopEmotionDetection();
    socket.emit('leave-room', roomID);
});

socket.on('user-disconnected', () => {
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject = null;
    }
});