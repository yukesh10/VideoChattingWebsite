const APP_ID = "GET YOUR OWN APP ID";

let uid = sessionStorage.getItem('uid');
if (!uid) {
    uid = String(Math.floor(Math.random() * 10000));
    sessionStorage.setItem('uid', uid);
}

let token = null;
let client;

let rtmClient;
let channel;

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

let displayName = sessionStorage.getItem('display_name');
let password = sessionStorage.getItem('password');

if (!roomId || !displayName) {
    window.location = "lobby.html";
}

let localTracks = [];
let remoteUsers = {};

let joinRoomInit = async () => {

    rtmClient = await AgoraRTM.createInstance(APP_ID);
    await rtmClient.login({uid, token});

    let channelInfo = await rtmClient.getChannelMemberCount([roomId]);
    if (channelInfo && channelInfo[roomId] == 0){
        await rtmClient.addOrUpdateChannelAttributes(roomId, {"channelPassword": password});
    } else {
        let {channelPassword} = await rtmClient.getChannelAttributesByKeys(roomId, ["channelPassword"]);
        if (password !== channelPassword.value){
            window.location = "lobby.html";
            return;
        }
    }

    await rtmClient.addOrUpdateLocalUserAttributes({'name': displayName});

    channel = await rtmClient.createChannel(roomId);
    await channel.join();

    // function defined in room_rtm.js file
    channel.on('MemberJoined', handleMemberJoined);
    channel.on('MemberLeft', handleMemberLeft);
    channel.on('ChannelMessage', handleChannelMessage);

    getMembers();
    addBotMessageToDom(`Welcome to the room ${displayName}! 👋`)

    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    await client.join(APP_ID, roomId, token, uid);

    client.on('user-published', handleUserPublished);
    client.on('user-left', handleUserLeft);

    joinStream();
}

let joinStream = async () => {
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks({}, {encoderConfig: {width: {min: 640, ideal: 1920, max: 1920}, height: {min: 480, ideal: 1080, max: 1080}}});

    let player = ` <div class="video__container" id="user-container-${uid}">
                    <div class="video-player" id="user-${uid}"></div>
                 </div>`;

    document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);

    localTracks[1].play(`user-${uid}`);
    await client.publish([localTracks[0], localTracks[1]]);
}

let handleUserPublished = async (user, mediaType) => {
    remoteUsers[user.uid] = user;

    await client.subscribe(user, mediaType);

    let player = document.getElementById(`user-container-${user.uid}`);
    if (player == null){
        player = ` <div class="video__container" id="user-container-${user.uid}">
                    <div class="video-player" id="user-${user.uid}"></div>
                 </div>`;
        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);
    }

    if (mediaType === 'video'){
        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio'){
        user.audioTrack.play();
    }
    
}

let handleUserLeft = async (user) => {
    delete remoteUsers[user.uid];
    document.getElementById(`user-container-${user.uid}`).remove();
}

let toggleCamera = async (e) => {
    let button = e.currentTarget;

    if (localTracks[1].muted){
        await localTracks[1].setMuted(false);
        button.classList.add('active');
    } else {
        await localTracks[1].setMuted(true);
        button.classList.remove('active');
    }
}

let toggleMic = async (e) => {
    let button = e.currentTarget;

    if (localTracks[0].muted){
        await localTracks[0].setMuted(false);
        button.classList.add('active');
    } else {
        await localTracks[0].setMuted(true);
        button.classList.remove('active');
    }
}

document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);

joinRoomInit();