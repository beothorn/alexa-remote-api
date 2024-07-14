"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const alexa_remote2_1 = __importDefault(require("alexa-remote2"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'My API',
            version: '1.0.0',
        },
    },
    apis: ['./src/**/*.ts'], // files containing annotations as above
};
const specs = (0, swagger_jsdoc_1.default)(options);
const cookiePath = 'alexa-cookie.txt';
const macDmsPath = 'macDms.txt';
const homeDir = os_1.default.homedir();
const separator = path_1.default.sep;
const alexaRemotePath = path_1.default.join(homeDir, '.alexaRemote');
if (!fs_1.default.existsSync(alexaRemotePath)) {
    fs_1.default.mkdirSync(alexaRemotePath);
}
console.log(`Folder created at: ${alexaRemotePath}`);
const expressPort = 3000;
const alexaLoginPort = 3001;
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(specs));
let alexa = new alexa_remote2_1.default();
alexa.init({
    cookie: readFromFile(cookiePath),
    proxyOnly: true,
    proxyOwnIp: 'localhost',
    proxyPort: alexaLoginPort,
    proxyLogLevel: 'info',
    bluetooth: true,
    logger: console.log,
    macDms: readFromFile(macDmsPath),
}, function (err) {
    if (err) {
        console.log(err);
    }
    else {
        console.log('alexa connection was reinitialized');
    }
});
alexa.on('cookie', (cookie, csrf, macDms) => {
    writeToFile(cookiePath, cookie);
    writeToFile(macDmsPath, macDms);
});
app.get('/', (req, res) => {
    if (!alexa) {
        res.send('use /connect to start');
    }
});
app.get('/reconnect', (req, res) => {
    alexa = new alexa_remote2_1.default();
    alexa.init({
        cookie: readFromFile(cookiePath),
        proxyOnly: true,
        proxyOwnIp: 'localhost',
        proxyPort: alexaLoginPort,
        proxyLogLevel: 'info',
        bluetooth: true,
        logger: console.log,
        macDms: readFromFile(macDmsPath),
    }, function (err) {
        if (err) {
            console.log(err);
            const url = extractUrl(err.message);
            if (url == 'no match') {
                res.send(`Error reinitializing: ${err.message}`);
            }
            else {
                res.redirect(url);
                return;
            }
        }
        else {
            res.send('alexa connection was reinitialized');
        }
    });
    alexa.on('cookie', (cookie, csrf, macDms) => {
        writeToFile(cookiePath, cookie);
        writeToFile(macDmsPath, macDms);
    });
});
// Lots of information about devices
app.get('/names', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(alexa.names));
});
// expects a json: { deviceName: "Kitchen", text: "Something to say" }
// try from the command line: 
// curl 'http://localhost:3000/speak' -H 'Content-Type: application/json' --data-raw '{"deviceName":"Kitchen","text":"Hi"}'
app.post('/speak', (req, res) => {
    const data = req.body;
    const device = alexa.names[data.deviceName];
    const serial = device.serialNumber;
    alexa.sendSequenceCommand(serial, 'speak', data.text);
    res.send('Data received');
});
app.listen(expressPort, () => {
    console.log(`Example app listening on port ${expressPort}`);
});
function extractUrl(errorMessage) {
    const urlPattern = /http:\/\/[^\s:\/]+:\d+\//;
    const match = errorMessage.match(urlPattern);
    return match ? match[0] : "no match";
}
function readFromFile(path) {
    try {
        const data = fs_1.default.readFileSync(`${alexaRemotePath}${separator}${path}`, 'utf8');
        return JSON.parse(data);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return {};
        }
        else {
            console.error(`Error reading file ${path}`, err);
            return {};
        }
    }
}
function writeToFile(path, data) {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        fs_1.default.writeFileSync(`${alexaRemotePath}${separator}${path}`, jsonString);
        console.log(`Successfully writen ${path}`);
    }
    catch (err) {
        console.error(`Error writing file ${path}`, err);
    }
}
