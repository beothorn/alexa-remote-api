import Alexa, { Serial } from 'alexa-remote2';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

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

const specs = swaggerJsdoc(options);


const cookiePath = 'alexa-cookie.txt';
const macDmsPath = 'macDms.txt';
const homeDir = os.homedir();
const separator = path.sep;
const alexaRemotePath = path.join(homeDir, '.alexaRemote');

if (!fs.existsSync(alexaRemotePath)) {
    fs.mkdirSync(alexaRemotePath);
}

console.log(`Folder created at: ${alexaRemotePath}`);

const expressPort = 3000;
const alexaLoginPort = 3001;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

let alexa = new Alexa();

alexa.init(
    {
        cookie: readFromFile(cookiePath),
        proxyOnly: true,
        proxyOwnIp: 'localhost',
        proxyPort: alexaLoginPort,
        proxyLogLevel: 'info',
        bluetooth: true,
        logger: console.log,
        macDms: readFromFile(macDmsPath),
    }, 
    function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log('Alexa connection was reinitialized');
        }
    }
);

alexa.on('cookie', (cookie, csrf, macDms) => {
    writeToFile(cookiePath, cookie);
    writeToFile(macDmsPath, macDms);
});

app.get('/', (req, res) => {
    if (!alexa) {
        res.send('Use /reconnect to start');
    }
});

app.get('/reconnect', (req, res) => {
    alexa = new Alexa();

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
            } else {
                res.redirect(url);
                return;
            }
        } else {
            res.send('alexa connection was reinitialized');
        }
    });
    alexa.on('cookie', (cookie, csrf, macDms) => {
        writeToFile(cookiePath, cookie);
        writeToFile(macDmsPath, macDms);
    });

});

/**
 * @swagger
 * /names:
 *   get:
 *     summary: Returns a list of Serial
 *     responses:
 *       200:
 *         description: A list of Serial
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   accountName:
 *                     type: string
 *                     example: "JohnDoe"
 *                   appDeviceList:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         deviceAccountId:
 *                           type: string
 *                           example: "123"
 *                         deviceType:
 *                           type: string
 *                           example: "Echo"
 *                         serialNumber:
 *                           type: string
 *                           example: "ABC123"
 *                   capabilities:
 *                     type: array
 *                     items:
 *                       type: string
 *                       example: "MusicPlayer"
 *                   charging:
 *                     type: string
 *                     example: "Not Charging"
 *                   deviceAccountId:
 *                     type: string
 *                     example: "123"
 *                   deviceFamily:
 *                     type: string
 *                     example: "Echo"
 *                   deviceOwnerCustomerId:
 *                     type: string
 *                     example: "456"
 *                   deviceType:
 *                     type: string
 *                     example: "Echo"
 *                   deviceTypeFriendlyName:
 *                     type: string
 *                     example: "Echo Dot"
 *                   essid:
 *                     type: string
 *                     example: "MyWiFi"
 *                   language:
 *                     type: string
 *                     example: "en-US"
 *                   macAddress:
 *                     type: string
 *                     example: "00:11:22:33:44:55"
 *                   online:
 *                     type: boolean
 *                     example: true
 *                   postalCode:
 *                     type: string
 *                     example: "12345"
 *                   registrationId:
 *                     type: string
 *                     example: "789"
 *                   remainingBatteryLevel:
 *                     type: string
 *                     example: "100%"
 *                   serialNumber:
 *                     type: string
 *                     example: "ABC123"
 *                   softwareVersion:
 *                     type: string
 *                     example: "1.0.0"
 *                   isControllable:
 *                     type: boolean
 *                     example: true
 *                   hasMusicPlayer:
 *                     type: boolean
 *                     example: true
 *                   isMultiroomDevice:
 *                     type: boolean
 *                     example: false
 *                   isMultiroomMember:
 *                     type: boolean
 *                     example: false
 *                   wakeWord:
 *                     type: string
 *                     example: "Alexa"
 */
app.get('/names', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(alexa.names));
});


app.post('/speak', (req, res) => {
    const data = req.body;
    const device: Serial = alexa.names[data.deviceName] as unknown as Serial;
    const serial = device.serialNumber;
    alexa.sendSequenceCommand(serial, 'speak', data.text);
    res.send('Data received');
});

app.listen(expressPort, () => {
    console.log(`Example app listening on port ${expressPort}`)
});

function extractUrl(errorMessage: string) {
    const urlPattern = /http:\/\/[^\s:\/]+:\d+\//;
    const match = errorMessage.match(urlPattern);
    return match ? match[0] : "no match";
}

function readFromFile(path: string) {
    try {
        const data = fs.readFileSync(`${alexaRemotePath}${separator}${path}`, 'utf8');
        return JSON.parse(data);
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return {};
        } else {
            console.error(`Error reading file ${path}`, err);
            return {};
        }
    }
}

function writeToFile(path:string, data: any) {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(`${alexaRemotePath}${separator}${path}`, jsonString);
        console.log(`Successfully writen ${path}`);
    } catch (err) {
        console.error(`Error writing file ${path}`, err);
    }
}
