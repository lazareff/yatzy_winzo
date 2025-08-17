import { GameData } from './common';
import { GameHelper } from './GameServerHelper';

export default interface IGameServer {
    /* save the helper function class, config etc. here */
    initialise(gameHelper: GameHelper, gameData: GameData): Promise<any>;

    /* return initial state of your game here 
    which the client will use to set the initial UI */
    getInitialGameState(userId: string): Promise<any>;

    /* send any extra packets here like setting initial turn 
    after the initial game state is sent */
    onInitialGameStateSent(): Promise<void>;

    /* handle game packets from client here like player move etc. */
    onMessageFromClient(userId: string, data: any): Promise<any>;

    /* return current state of your game here which 
    the client will use to reset their UI after internet 
    reconnection, BG/ FG etc. */
    getCurrentGameState(userId: string): Promise<any>;

    /* return the player score here to decide on the winner 
    at the end of the game*/
    getPlayerScore(userId: string): Promise<number>;

    /* handle game time over to clear all timers etc. */
    onGameTimeOver(userId: string): Promise<void>;

    /* handle player leave to remove them from turn order etc. */
    onPlayerLeave: (userId: string) => Promise<void>;
}
