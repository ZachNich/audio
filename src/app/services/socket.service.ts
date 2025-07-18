import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';
import { SocketEvents } from '../enums/socket.enum';

@Injectable({ providedIn: 'root' })
export class SocketService {
  //TODO: Probably use more specific methods and types for params/outputs
  private socket = io('http://localhost:3000');

  public send(event: SocketEvents, message?: any) {
    this.socket.emit(event, message);
  }

  public receive(event: SocketEvents, callback: (args: any) => any) {
    this.socket.on(event, callback);
  }
}
