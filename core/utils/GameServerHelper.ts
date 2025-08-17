import { LOG_LEVEL } from './enums';

export type GameHelper = {
    /* send game packets to client */
    sendMessageToClient: (userId: string, data: any) => Promise<void>;

    /* broadcast game packets to all clients */
    sendMessageToAllClient: (data: any) => Promise<void>;

    /* send analytics events for creating product funnel */
    sendEventLogs: (userId: string, data: any) => Promise<void>;

    /* send logs for debugging */
    sendLog: (msg: string, level?: LOG_LEVEL) => Promise<void>;

    /* to be called once a user leaves a game */
    exitPlayerFromGame: (userId: string) => Promise<void>;

    /* to be called once the game is over */
    finishGame: (winner) => Promise<void>;

    /* forcefully send the current game state to a user once server detects something is wrong */
    sendServerGameState: (userId: string) => Promise<void>;
    
    /* RNG helper functions */
    randomHelper: any;
};
