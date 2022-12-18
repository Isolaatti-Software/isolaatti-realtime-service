

const ISOLAATTI_BACKEND_SERVER = process.env.backend ? "https://isolaatti.azurewebsites.net" : "http://localhost:5000";
console.log(process.env.backend);

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const bodyParser = require("express");
const axios = require("axios").default;



const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:5000", "https://backend.isolaatti.com"],
            credentials: true
        }
    }
);

io.use((socket, next) => {
    const token = socket.handshake.auth.sessionToken;
    // console.log(token);
    // Make authentication against Isolaatti backend
    axios.request({
        url:`${ISOLAATTI_BACKEND_SERVER}/api/LogIn/Verify`,
        method: "post",
        headers: {
            'Content-Type': 'application/json',
            'sessionToken': token
        }
    }).then(response => {
        const authResult = response.data;
        if(authResult.isValid) {
            socket.join(`user-${authResult.userId}`);
            socket.on("subscribe-scope", (scopeData) => {
                console.log(scopeData);
                socket.join(`${scopeData.type}-${scopeData.id}`);
            });
            next();
            // console.log("Successful authentication");
        } else {
            next({message: "Authentication failed, invalid token", data: authResult});
        }

    }).catch(error => {
        console.error(error);
    })

});

async function validateRemoteKey(key){
    const response = await axios.request({
        url: `${ISOLAATTI_BACKEND_SERVER}/realtime-service/verify-key`,
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        data: {
            key: key
        }
    });

    return response.status === 200;
}

app.post("/send_notification", async (req, res) => {
   const payload = req.body;
   if(!await validateRemoteKey(payload.secret)){
       res.send({status: "invalid"});
   }

   const userId = payload.userId;
   io.to(`user-${userId}`).emit("notification", payload.data);
   res.send();
});

app.post("/update_event", async (req, res) => {
    const payload = req.body;
    if(!await validateRemoteKey(payload.secret)){
        res.send({status: "invalid"});
    }
    const updateEventData = payload.eventData;
    io.to(`${updateEventData.type}-${updateEventData.id}`).emit(updateEventData.type,updateEventData.data);
    console.log(`evento emitido ${updateEventData.type}-${updateEventData.id}`, );
    console.log(updateEventData.data);
    res.send();
});

httpServer.listen(3000);
console.log("Servidor corriendo...");
console.log("Servidor corriendo...");
