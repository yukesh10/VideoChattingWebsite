let APP_ID = "GET YOUR OWN APP ID";

let token = null;
let uid = String(Math.floor(Math.random() * 10000));

let client;
let channel;

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');
let password = sessionStorage.getItem('password');

const lobby = "lobby-peertopeer.html"

if (!roomId || !password){
    window.location = lobby;
}

let localStream; // local user 
let remoteStream;   // remote user
let peerConnection;

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
}

let constraints = {
    video : {
        width: {min: 640, ideal: 1920, max: 1920},
        height: {min: 480, ideal: 1080, max: 1080}
    },
    audio: true
}

let init = async() => {

    // setting up Agora SDK
    client = await AgoraRTM.createInstance(APP_ID);
    await client.login({uid, token});

    // if already two user are in the channel, return to lobby page
    let channelInfo = await client.getChannelMemberCount([roomId]);
    if (channelInfo && channelInfo[roomId] >= 2){
        window.location = lobby;
        return;
    }

    if (channelInfo && channelInfo[roomId] == 0){
        // creating channel based on room name
        channel = client.createChannel(roomId);
        await channel.join();
        // add password attributes
        await client.addOrUpdateChannelAttributes(roomId, {"channelPassword": password});
    } else {
        let {channelPassword} = await client.getChannelAttributesByKeys(roomId, ["channelPassword"]);
        // join only if the password matches
        if (password == channelPassword.value){
             // joining based on room name
            channel = client.createChannel(roomId);
            await channel.join();
        } else {
            window.location = lobby;
            return;
        }
    }

    

    // Agora SDK event listeners
    channel.on('MemberJoined', handleUserJoined);
    channel.on('MemberLeft', handleUserLeft);
    client.on('MessageFromPeer', handleMessageFromPeer);

    // getting access to audio and video
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('user-1').srcObject = localStream;
}

let handleUserLeft = (MemberId) => {
    document.getElementById('user-2').style.display = 'none';
    document.getElementById('user-1').classList.remove('smallFrame');
}

let handleMessageFromPeer = async(message, MemberId) => {
    message = JSON.parse(message.text);
    if (message.type === "offer"){
        createAnswer(MemberId, message.offer);
    }

    if (message.type === "answer"){
        addAnswer(message.answer);
    }

    if (message.type === "candidate"){
        if (peerConnection){
            peerConnection.addIceCandidate(message.candidate);
        }
    }
}


let handleUserJoined = async (MemberId) => {
    console.log('A new user has joined the channel: ', MemberId);
    createOffer(MemberId);
}

let createPeerConnection = async (MemberId) => {
    peerConnection = new RTCPeerConnection(servers);

    remoteStream = new MediaStream();
    document.getElementById('user-2').srcObject = remoteStream;
    document.getElementById('user-2').style.display = 'block';

    document.getElementById('user-1').classList.add('smallFrame');

    if (!localStream){
        localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
        document.getElementById('user-1').srcObject = localStream;   
    }

    // get all localStream track and add in peerConnection
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // add localStream track to remoteStream
    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        })
    }

    // send ICE candidate to peer
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate){
            client.sendMessageToPeer({text: JSON.stringify({'type': 'candidate', 'candidate':event.candidate})}, MemberId);
        }
    }
}

let createOffer = async (MemberId) => {
    await createPeerConnection(MemberId);
    let offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // send offer to peer
    client.sendMessageToPeer({text: JSON.stringify({'type': 'offer', 'offer': offer})}, MemberId);
}

let createAnswer = async (MemberId, offer) => {
    await createPeerConnection(MemberId);

    await peerConnection.setRemoteDescription(offer);

    let answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer)

    // send answer to the peer who created offer
    client.sendMessageToPeer({text: JSON.stringify({'type': 'answer', 'answer': answer})}, MemberId);
}

let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription){
        peerConnection.setRemoteDescription(answer);
    }
}

let leaveChannel = async () => {
    await channel.leave();
    await channel.logout();
}

let toggleCamera = async () => {
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video');

    if (videoTrack.enabled){
        videoTrack.enabled = false;
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(255, 80, 80)';
    } else {
        videoTrack.enabled = true;
        document.getElementById('camera-btn').style.backgroundColor = 'rgba(179, 102, 249, .9)';
    }
}

let toggleMic = async () => {
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio');

    if (audioTrack.enabled){
        audioTrack.enabled = false;
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(255, 80, 80)';
    } else {
        audioTrack.enabled = true;
        document.getElementById('mic-btn').style.backgroundColor = 'rgba(179, 102, 249, .9)';
    }
}

window.addEventListener('beforeunload', leaveChannel);

document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);

init();