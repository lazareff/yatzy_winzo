import IGameServer from '../../core/utils/IGameServer';
import IGameList from '../../core/utils/IGameList';

export default class GameList implements IGameList {
    game: IGameServer;
    key: string;
}
