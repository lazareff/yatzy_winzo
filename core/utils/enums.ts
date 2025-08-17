export enum PACKET {
    CLIENT_TO_SERVER = 5001,
    SERVER_TO_CLIENT = 5002,    
    TABLE_INFO = 5004,
}

export enum PING_TYPE {
    VERY_HIGH = 'VERY_HIGH',
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW',
}

export enum LOG_LEVEL {
    INFO = 'INFO',
    DEBUG = 'DEBUG',
    ERROR = 'ERROR',
}

export enum INTERNET_STATE {
    DISCONNECTED = 0,
    CONNECTED = 1,
}

