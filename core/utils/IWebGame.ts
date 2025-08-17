import { IGameData } from './common';
import { INTERNET_STATE, PING_TYPE } from './enums';
import WebGameHelper from './WebGameHelper';

export default interface IWebGame {
    /* A callback of the completion of the static preload method */
    onPreloadComplete(): any;

    /* Contains gameHelper interface which has inbuilt helper 
    functions and gameData object which has game and players specific data. 
    Is invoked after onPreloadComplete method */
    initialise(gameHelper: WebGameHelper, gameData: IGameData): any;

    /* Contains the intitial state of the game */
    setInitialGameState(data: any): any;

    /* Invoked every time a packet is recieved from the server end */
    onMessageFromServer(data: any): any;

    /* Provides the current stength of user's network */
    onPingUpdate(ping: PING_TYPE): any;

    /* Provides the current internet state */
    onInternetStateUpdate(state: INTERNET_STATE): any;

    /* Provides current state of the game present on the server */
    setCurrentGameState(data: any): any;
}
