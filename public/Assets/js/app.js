var AppProcess = (function() {
  var peers_connection_ids = [];
  var peers_connection = [];
  var remote_vid_stream = [];
  var remote_aud_stream = [];
  var local_div;
  var audio;
  var isAudioMute = true;
  var rtp_aud_senders = [];
  var rtp_vid_senders = [];
  var serverProcess;
  var video_states = {None: 0, Camera: 1, ScreenShare: 2};
  var video_st = video_states.None;
  var videoCamTrack;

  async function _init(SDP_function, my_connid) {
    serverProcess = SDP_function;
    my_connection_id = my_connid;
    eventProcess();
    local_div = document.getElementById('localVideoPlayer');
  }

  function eventProcess() {
    $('#micMuteUnmute').on('click', async function() {
      if (!audio) {
        await loadAudio();
      }
      if (!audio) {
        alert('Audio Permission has not granted');
        return;
      }
      if (isAudioMute) {
        audio.enabled = true;
        $(this).html('<span class=\'material-icons\' style=\'width: 100%;\'>mic</span>');
        updateMediaSenders(audio, rtp_aud_senders);
      } else {
        audio.enabled = false;
        $(this).html('<span class=\'material-icons\' style=\'width: 100%;\'>mic_off</span>');
        //새로
        removeAudioStream(rtp_aud_senders);
      }
      isAudioMute = !isAudioMute;
    });
    $('#videoOnOff').on('click', async function() {
      if (video_st == video_states.Camera) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.Camera);
      }
    });
    $('#ScreenShareOnOf').on('click', async function() {
      if (video_st == video_states.ScreenShare) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.ScreenShare);
      }
    });
  }
  function connection_status(connection) {
    if (connection &&
        (connection.connectionState == 'new' ||
         connection.connectionState == 'connecting' ||
         connection.connectionState == 'connected')) {
      return true;
    } else {
      return false;
    }
  }

  async function updateMediaSenders(track, rtp_senders) {
    for (var con_id in peers_connection_ids) {
      if (connection_status(peers_connection[con_id])) {
        if (rtp_senders[con_id] && rtp_senders[con_id].track) {
          //이미 비디오가 공유 되고있을때 
          rtp_senders[con_id] = rtp_senders[con_id].replaceTrack(track);
        } else {
          rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
        }
      }
    }
  }

  function removeMediaSenders(rtp_senders){
      for(var con_id in peers_connection_ids){
          if(rtp_senders[con_id] && connection_status(peers_connection[con_id])){
              peers_connection[con_id].removeTrack(rtp_senders[con_id]);
              rtp_senders[con_id]=null;
          }
      }
  }

  function removeAudioStream(rtp_aud_senders){
    if(audio){
      audio.stop();
      audio = null;
      removeMediaSenders(rtp_aud_senders);
    }
  }

  function removeVideoStream(rtp_vid_senders){
    if(videoCamTrack){
      removeMediaSenders(rtp_vid_senders);
      videoCamTrack.stop();
      videoCamTrack = null;
      local_div.srcObject = null;
    }
  }

  async function loadAudio(){
      try{
          var audstream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true
          })
          audio = audstream.getAudioTracks()[0];
          audio.enabled = false;
      }catch(e){
          console.log(e);
      }
  }

  async function videoProcess(videostate) {
    if(videostate == video_states.None){
      $("#videoOnOff").html('<span class="material-icons" style="width: 100%;">videocam_off</span>');
      $("#ScreenShareOnOf").html('<span class="material-icons">present_to_all</span><div>Present Now</div>');
      removeVideoStream(rtp_vid_senders);
      video_st = videostate;
      return;
    }
    
    try {
      var vstream = null;
      if (videostate == video_states.Camera) {
        vstream = await navigator.mediaDevices.getUserMedia(
          {video: {width: 1920, height: 1080}, audio: false})

          //아이콘처리
          $("#videoOnOff").html('<span class="material-icons style="width: 100%;">videocam</span>');
          $("#ScreenShareOnOf").html('<span class="material-icons">present_to_all</span><div>Present Now</div>');
        } else if (videostate == video_states.ScreenShare) {
          vstream = await navigator.mediaDevices.getDisplayMedia(
            {video: {width: 1920, height: 1080}, audio: false});

          //아이콘 처리
          $("#videoOnOff").html('<span class="material-icons style="width: 100%;">videocam_off</span>');
          $("#ScreenShareOnOf").html('<span class="material-icons text-success">present_to_all</span><div class="text-success">Stop</div>');  

          vstream.oninactive = (e) =>{
          removeVideoStream(rtp_vid_senders);
          $("#ScreenShareOnOf").html('<span class="material-icons">present_to_all</span><div>Present Now</div>');
        }
      }
      if (vstream && vstream.getVideoTracks().length > 0) {
        videoCamTrack = vstream.getVideoTracks()[0];
        if (videoCamTrack) {
          local_div.srcObject = new MediaStream([videoCamTrack]);
          updateMediaSenders(videoCamTrack, rtp_vid_senders);
        }
      }
    } catch (e) {
      console.log(e);
      return;
    }
    video_st = videostate;
  }


  var iceConfiguration =
      {
        iceServers: [
          {urls: 'stun:stun.l.google.com:19302'},
          {urls: 'stun:stun1.l.google.com:19302'}
        ]
      }

  async function setConnection(connID) {
    var connection = new RTCPeerConnection(iceConfiguration)
    
    connection.onnegotiationneeded = async function(event) {
      await setOffer(connID);
    };
    connection.onicecandidate = function(event) {
      if (event.candidate) {
        serverProcess(JSON.stringify({icecandidate: event.candidate}), connID);
      }
    };
    //track event 생길 때
    connection.ontrack = function(event) {
      alert("ontrack")
      if (!remote_vid_stream[connID]) {
        remote_vid_stream[connID] = new MediaStream;
      }
      if (!remote_aud_stream[connID]) {
        remote_aud_stream[connID] = new MediaStream;
      }
      if (event.track.kind == 'video') {
        remote_vid_stream[connID].getVideoTracks().forEach(
            (t) => remote_vid_stream[connID].removeTrack(t));
        remote_vid_stream[connID].addTrack(event.track);
        var remoteVideoPlayer = document.getElementById('v_' + connID);
        remoteVideoPlayer.srcObject=null;
        remoteVideoPlayer.srcObject = remote_vid_stream[connID];
        remoteVideoPlayer.load();
      } else if (event.track.kind == 'audio') {
        remote_aud_stream[connID].getAudioTracks().forEach(
            (t) => remote_aud_stream[connID].removeTrack(t));
        remote_aud_stream[connID].addTrack(event.track);
        var remoteAudioPlayer = document.getElementById('a_' + connID);
        remoteAudioPlayer.srcObject=null;
        remoteAudioPlayer.srcObject = remote_aud_stream[connID];
        remoteAudioPlayer.load();
      };
    };
    peers_connection_ids[connID] = connID;
    peers_connection[connID] = connection;

    //카메라나 스크린셰어가 on인것만 업데이트해줌(참가자가 새로 들어왔을 때 이미 카메라 켜진화면은 보여줌)
    if (video_st == video_states.Camera ||
        video_st == video_states.ScreenShare) {
      if (videoCamTrack) {
        updateMediaSenders(videoCamTrack, rtp_vid_senders);
      }
    }

    return connection;
  }

  async function
  setOffer(connID) {
    var connection = peers_connection[connID];
    var offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    serverProcess(JSON.stringify({offer: connection.localDescription}), connID);
  }

  async function
  SDPProcess(message, from_connid) {
    message = JSON.parse(message)
    if (message.answer) {
      await peers_connection[from_connid].setRemoteDescription(
          new RTCSessionDescription(message.answer));
    }
    else if (message.offer) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }

      await peers_connection[from_connid].setRemoteDescription(
          new RTCSessionDescription(message.offer));
      var answer = await peers_connection[from_connid].createAnswer();
      await peers_connection[from_connid].setLocalDescription(answer);
      serverProcess(JSON.stringify({answer: answer}), from_connid);
    }
    else if (message.icecandidate) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      try {
        await peers_connection[from_connid].addIceCandidate(
            message.icecandidate);

      } catch (e) {
        console.log(e);
      }
    }
  }

  async function closeConnection(connid){

    peers_connection_ids[connid] = null;
    if(peers_connection[connid]){
      peers_connection[connid].close();
      peers_connection[connid] = null;
    };

    if(remote_vid_stream[connid]){
      remote_vid_stream[connid].getTracks().forEach((t) => {
        if(t.stop) t.stop();
      })
      remote_vid_stream[connid] = null;
    };

    if(remote_aud_stream[connid]){
      remote_aud_stream[connid].getTracks().forEach((t) => {
        if(t.stop) t.stop();
      })
      remote_aud_stream[connid] = null;
    };

  }

  return {
    setNewConnection: async function(connID) {
      await setConnection(connID);
    }, init: async function(SDP_function, my_connid) {
      await _init(SDP_function, my_connid);
    }, processClientFunc: async function(data, from_connid) {
      await SDPProcess(data, from_connid);
    }, closeConnectionCall: async function(connid) {
      await closeConnection(connid);
    }
  }
})();

var MyApp = (function() {
  var user_id = '';
  var meeting_id = '';

  function init(usrid, mtid) {
    user_id = usrid;
    meeting_id = mtid;
    $('#meetingContainer').show();
    $('#me h2').text(user_id + '(Me)');
    event_signaling_server();
  }

  var socket = null;
  function event_signaling_server() {
    socket = io.connect();

    var SDP_function =
        function(data, to_connid) {
      socket.emit('SDPProcess', {message: data, to_connid: to_connid})
    }

        socket.on('connect', () => {
          if (socket.connected) {
            AppProcess.init(SDP_function, socket.id);
            if (user_id != '' && meeting_id != '') {
              socket.emit(
                  'userconnect', {displayName: user_id, meetingID: meeting_id})
            }
          }
        });


    //연결종료 알려주기
    socket.on("inform_others_about_disconnected_user", function(data){
      $("#"+data.connID).remove();
      AppProcess.closeConnectionCall(data.connID);
    });

    //방참가자들에게 내 정보 추가
    socket.on('inform_others_about_me', function(data) {
      addUser(data.other_user_id, data.connID);
      AppProcess.setNewConnection(data.connID);
    });

    //내방에 참가자 추가
    socket.on('inform_me_about_other_users', function(other_users) {
      if (other_users) {
        for (var i = 0; i < other_users.length; i++) {
          addUser(other_users[i].user_id, other_users[i].connectionID);
          AppProcess.setNewConnection(other_users[i].connectionID);
        }
      }
    })
    socket.on('SDPProcess', async function(data) {
      await AppProcess.processClientFunc(data.message, data.from_connid);
    })
  }

  //참가자 추가
  function addUser(other_user_id, connID) {
    var newDivId = $('#otherTemplate').clone();
    newDivId = newDivId.attr('id', connID).addClass('other');
    newDivId.find('h2').text(other_user_id);
    newDivId.find('video').attr('id', 'v_' + connID);
    newDivId.find('audio').attr('id', 'a_' + connID);
    newDivId.show();
    $('#divUsers').append(newDivId);
  }

  return {
    _init: function(user_id, meeting_id) {
      init(user_id, meeting_id);
    }
  }
})();