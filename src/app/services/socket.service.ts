import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';
import { SocketEvents } from './socket.enum';

@Injectable()
export class SocketService {
  private socket = io('http://localhost:3000');

  public send(event: SocketEvents, message: any[]) {
    this.socket.emit(event, ...message);
  }
}
