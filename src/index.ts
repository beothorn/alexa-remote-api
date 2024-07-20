import Alexa, { CallbackWithError, CallbackWithErrorAndBody, SequenceNodeCommand, SequenceValue, Serial, SerialOrNameOrArray } from 'alexa-remote2';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const args = process.argv.slice(2);
const configFilePath = args[0];

let config = {
    proxyOwnIp: 'localhost',
    proxyPort: 3000,
    expressPort: 3001
}

if(configFilePath) {
    config = readFromFile(configFilePath);
}

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

const expressPort = config.expressPort;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

let alexa:Alexa;

function startAlexa(cookie: any, errorHandler: CallbackWithError) {
    alexa = new Alexa();
    alexa.init(
        {
            cookie: cookie,
            proxyOnly: true,
            proxyOwnIp: config.proxyOwnIp, //'192.168.2.169',
            proxyPort: config.proxyPort,
            proxyLogLevel: 'info',
            bluetooth: true,
            logger: console.log,
            macDms: readFromFile(macDmsPath),
        }, errorHandler
    );
    alexa.on('cookie', (cookie: any, _csrf:any, macDms:any) => {
        console.log("Received cookie.");
        console.log(cookie);
        console.log("Received macDms.");
        console.log(macDms);
        writeToFile(cookiePath, cookie);
        writeToFile(macDmsPath, macDms);
    });
}

const cookieFromFile:any = readFromFile(cookiePath);
if(cookieFromFile){
    startAlexa(cookieFromFile, ((err) => {
        if (err) {
            console.log(err);
        } else {
            console.log('Alexa connection was reinitialized');
        }
    }) as CallbackWithError);
}

app.get('/', (req, res) => {
    if (!alexa) {
        res.send('Use /reconnect to start and /api-docs to see endpoints. Please change your authentication to use an OTP instead of SMS or email.');
    }
});

/**
 * @swagger
 * /clearSavedFiles:
 *   delete:
 *     summary: Deletes cookies and other persisted files.
 */
app.delete('/clearCookies', (req, res) => {
    fs.rmdirSync(alexaRemotePath);
    fs.mkdirSync(alexaRemotePath);
});

/**
 * @swagger
 * /reconnect:
 *   get:
 *     summary: Redirects to login on amazon via proxy.
 */
app.get('/reconnect', (req, res) => {
    startAlexa({}, ((err) => {
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
    }) as CallbackWithError);
});

/**
 * @swagger
 * /getAuthenticationDetails:
 *   get:
 *     summary: Return authentication details.
 *     responses:
 *       200:
 *         description: Authentication details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                   authenticated:
 *                     type: boolean
 *                   canAccessPrimeMusicContent:
 *                     type: boolean
 *                   customerEmail:
 *                     type: string
 *                   customerId:
 *                     type: string
 *                   customerName:
 *                     type: string
 */
app.get('/getAuthenticationDetails', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(alexa.getAuthenticationDetails()));
});

/**
 * @swagger
 * /checkAuthentication:
 *   get:
 *     summary: Return json with authencication info.
 *     responses:
 *       200:
 *         description: A JSON with the authentication state.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticated:
 *                   type: boolean
 */
app.get("/checkAuthentication", (req, res) => {
    alexa.checkAuthentication((result, error) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({"authenticated": result}));
    });
})

/**
 * @swagger
 * /getUsersMe:
 *   get:
 *     summary: Lost of information about the user.
 *     responses:
 *       200:
 *         description: Lost of information about the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 countryOfResidence:
 *                   type: string
 *                 email:
 *                   type: string
 *                 eulaAcceptance:
 *                   type: boolean
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                 fullName:
 *                   type: string
 *                 hasActiveDopplers:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 marketPlaceDomainName:
 *                   type: string
 *                 marketPlaceId:
 *                   type: string
 *                 marketPlaceLocale:
 *                   type: string
 */
app.get('/getUsersMe', (req, res) => {
    alexa.getUsersMe((err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Something went wrong' });
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
    });
});

/**
 * @swagger
 * /getHousehold:
 *   get:
 *     summary: Retrieve household information.
 *     responses:
 *       200:
 *         description: Household information retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 __type:
 *                   type: string
 *                   description: The type of the household model.
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       email:
 *                         type: string
 *                         description: The email of the account.
 *                       eulaAcceptance:
 *                         type: boolean
 *                         description: Indicates if the EULA was accepted.
 *                       firstName:
 *                         type: string
 *                         description: The first name of the account holder.
 *                       fullName:
 *                         type: string
 *                         description: The full name of the account holder.
 *                       id:
 *                         type: string
 *                         description: The ID of the account.
 *                       pendingUserPin:
 *                         type: string
 *                         nullable: true
 *                         description: The pending user PIN, if any.
 *                       role:
 *                         type: string
 *                         description: The role of the account holder in the household.
 *                 id:
 *                   type: string
 *                   nullable: true
 *                   description: The ID of the household.
 */
app.get('/getHousehold', (req, res) => {
    alexa.getHousehold(((err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Something went wrong' });
        }
        console.log(result);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
    }) as CallbackWithErrorAndBody);
});


/**
 * @swagger
 * /getDevices:
 *   get:
 *     summary: Retrieve a list of devices.
 *     responses:
 *       200:
 *         description: A list of devices.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       accountName:
 *                         type: string
 *                       appDeviceList:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             deviceAccountId:
 *                               type: string
 *                             deviceType:
 *                               type: string
 *                             serialNumber:
 *                               type: string
 *                       associatedUnitIds:
 *                         type: array
 *                         items:
 *                           type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *                       charging:
 *                         type: string
 *                         nullable: true
 *                       clusterMembers:
 *                         type: array
 *                         items:
 *                           type: string
 *                       deviceAccountId:
 *                         type: string
 *                       deviceFamily:
 *                         type: string
 *                       deviceOwnerCustomerId:
 *                         type: string
 *                       deviceType:
 *                         type: string
 *                       deviceTypeFriendlyName:
 *                         type: string
 *                         nullable: true
 *                       essid:
 *                         type: string
 *                         nullable: true
 *                       language:
 *                         type: string
 *                         nullable: true
 *                       macAddress:
 *                         type: string
 *                         nullable: true
 *                       online:
 *                         type: boolean
 *                       parentClusters:
 *                         type: array
 *                         items:
 *                           type: string
 *                       postalCode:
 *                         type: string
 *                         nullable: true
 *                       registrationId:
 *                         type: string
 *                         nullable: true
 *                       remainingBatteryLevel:
 *                         type: number
 *                         nullable: true
 *                       serialNumber:
 *                         type: string
 *                       softwareVersion:
 *                         type: string
 */
app.get('/getDevices', (req, res) => {
    alexa.getDevices(((err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Something went wrong' });
        }
        console.log(result);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
    }) as CallbackWithErrorAndBody);
});

/**
 * @swagger
 * /getSmarthomeDevices:
 *   get:
 *     summary: Return smart home devices.
 *     responses:
 *       200:
 *         description: A list of smart home devices.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     additionalProperties:
 *                       type: object
 */
app.get('/getSmarthomeDevices', (req, res) => {
    alexa.getSmarthomeDevices(((err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Something went wrong' });
        }
        console.log(result);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
    }) as CallbackWithErrorAndBody);
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

type SendCommand = {
    serialOrName: string,
    command: SequenceNodeCommand,
    value: SequenceValue
};
/**
 * @swagger
 * /sendCommand:
 *   post:
 *     summary: Send a command to a device.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serialOrName:
 *                 type: string
 *                 example: "Kitchen"
 *               command:
 *                 type: string
 *                 example: "speak"
 *                 enum:
 *                   - weather
 *                   - traffic
 *                   - flashbriefing
 *                   - goodmorning
 *                   - funfact
 *                   - joke
 *                   - cleanup
 *                   - singasong
 *                   - tellstory
 *                   - calendarToday
 *                   - calendarTomorrow
 *                   - calendarNext
 *                   - textCommand
 *                   - curatedtts
 *                   - volume
 *                   - deviceStop
 *                   - deviceStopAll
 *                   - deviceDoNotDisturb
 *                   - deviceDoNotDisturbAll
 *                   - speak
 *                   - skill
 *                   - notification
 *                   - announcement
 *                   - ssml
 *                   - fireTVTurnOn
 *                   - fireTVTurnOff
 *                   - fireTVTurnOnOff
 *                   - fireTVPauseVideo
 *                   - fireTVResumeVideo
 *                   - fireTVNavigateHome
 *               value:
 *                 oneOf:
 *                   - type: string
 *                     example: "Hello World!"
 *                   - type: number
 *                   - type: boolean
 *                   - type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       text:
 *                         type: string
 *             required:
 *               - serialOrName
 *               - command
 *               - value
 *     responses:
 *       200:
 *         description: Command sent successfully.
 *       400:
 *         description: Bad request. Invalid input parameters.
 *       500:
 *         description: Internal server error.
 */
app.post('/sendCommand', (req, res) => {
    const sendSequenceCommand: SendCommand = req.body;
    alexa.sendSequenceCommand(
        sendSequenceCommand.serialOrName,
        sendSequenceCommand.command,
        sendSequenceCommand.value
    );
    res.sendStatus(200);
});

type Speak = {
    serialOrName: string,
    text: string
};
/**
 * @swagger
 * /speak:
 *   post:
 *     summary: Sends a text for Alexa to say it.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serialOrName:
 *                 type: string
 *                 example: "Kitchen"
 *               text:
 *                 type: string
 *                 example: "Hello!"
 *             required:
 *               - serialOrName
 *               - text
 *     responses:
 *       200:
 *         description: Command sent successfully.
 *       400:
 *         description: Bad request. Invalid input parameters.
 *       500:
 *         description: Internal server error.
 */
app.post('/speak', (req, res) => {
    const data: Speak = req.body;
    alexa.sendSequenceCommand(data.serialOrName, 'speak', data.text);
    res.sendStatus(200);
});

/**
 * @swagger
 * /getMusicProviders:
 *   get:
 *     summary: Return music providers.
 *     responses:
 *       200:
 *         description: A list of smart home devices.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     additionalProperties:
 *                       type: object
 */
 app.get('/getMusicProviders', (req, res) => {
    alexa.getMusicProviders((err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Something went wrong' });
        }
        return res.json(result);
    });
});

type PlayMusicProvider = {
    serialOrName: string,
    providerId: string,
    searchPhrase: string
};
/**
 * @swagger
 * /playMusicProvider:
 *   post:
 *     summary: Plays a music with provider.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serialOrName:
 *                 type: string
 *                 example: "Kitchen"
 *               providerId:
 *                 type: string
 *                 example: "AMAZON_MUSIC"
 *               searchPhrase:
 *                 type: string
 *                 example: "Happy birthday"
 *             required:
 *               - serialOrName
 *               - providerId
 *               - searchPhrase
 *     responses:
 *       200:
 *         description: Command sent successfully.
 *       400:
 *         description: Bad request. Invalid input parameters.
 *       500:
 *         description: Internal server error.
 */
 app.post('/playMusicProvider', (req, res) => {
    const data: PlayMusicProvider = req.body;
    alexa.playMusicProvider(data.serialOrName, data.providerId, data.searchPhrase, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Something went wrong' });
        }
        return res.json(result);
    });
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
            return null;
        } else {
            console.error(`Error reading file ${path}`, err);
            return null;
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
