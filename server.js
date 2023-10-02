//load express library as variable
const express = require("express");
const path = require("path");
var app = express();
var server = app.listen(3000, function(){
    console.log("listening on port 3000");
});

const io = require("socket.io")(server);
app.use(express.static(path.join(__dirname, "")));

var userConnections = [];
io.on("connection", (socket) => {
    console.log("socket id is",socket.id);
    socket.on("userconnect", (data) => {
        console.log("userconnect", data.displayName, data.meetingID);

        //깉은방에 있는 user로 거르기
        var other_users = userConnections.filter((p) => p.meeting_id == data.meetingID);

        //방에 참가한 유저정보 추가
        userConnections.push({
            connectionID: socket.id,
            user_id: data.displayName,
            meeting_id: data.meetingID
        });

        //같은 방에 있는 다른 유저에게 내 정보 보내기
        other_users.forEach((v) => {
            socket.to(v.connectionID).emit("inform_others_about_me",{
                other_user_id: data.displayName,
                connID: socket.id
            });
        });

        //이벤트가 생길때마다 받아온 정보를 다시 보내줌
        socket.on("SDPProcess", (data) => {
            socket.to(data.to_connid).emit("SDPProcess",{
                message: data.message,
                from_connid:socket.id
            });
        });

        socket.on("disconnect", function(){
            console.log("disconnected: " + socket.id);
            var disUser = userConnections.find((p) => p.connectionID == socket.id)

            if(disUser){
                var meetingid = disUser.meeting_id;
                userConnections = userConnections.filter((p) => p.connectionID != socket.id);
                userConnections.filter((p) => p.meeting_id == meetingid).forEach((v) => {
                    socket.to(v.connectionID).emit("inform_others_about_disconnected_user",{
                        connID:socket.id
                    });
                }); 
            }
        })
        socket.emit("inform_me_about_other_users", other_users);
    })
})