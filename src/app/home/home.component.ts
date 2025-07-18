import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { SocketService } from '../services/socket.service';
import { SocketEvents } from '../enums/socket.enum';
import { FormsModule } from '@angular/forms';
import { UUID } from '../types/uuid.type';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  providers: [FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy {
  @HostListener('window:beforeunload', ['$event']) //TODO: Update to serverside check
  handleBeforeUnload() {
    this.leaveSession();
  }
  @ViewChild('equalizerCanvas')
  public canvasRef?: ElementRef<HTMLCanvasElement>;
  public isRecording = signal(false);
  public availableSessions = signal<string[]>([]);
  public selectedSession = signal<string | null>(null);
  public roomMembers = signal<UUID[]>([]);
  public currentRoom = signal<string | null>(null);

  private roomConnections = new Map<UUID, RTCPeerConnection>();
  private userId = crypto.randomUUID(); //TODO: To be updated to DB.users.id
  private animationId: number | null = null;
  private audioContext = new AudioContext();
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> = new Uint8Array();
  private readonly subscriptions = new Subscription();

  constructor(private socketService: SocketService) {}

  public ngOnInit(): void {
    // this.connect(); //sets ice candidates, sends offer
    this.initializeReceivers(); //receives offer, sends answer, receives answer, receive ice candidates
    this.getSessions(); //gets active rooms
  }

  public ngOnDestroy(): void {
    this.leaveSession();
    this.subscriptions.unsubscribe();
  }

  public getSessions(): void {
    this.socketService.send(SocketEvents.getRooms);
  }

  public startSession(): void {
    const roomId = crypto.randomUUID();
    this.socketService.send(SocketEvents.joinRoom, {
      roomId,
      userId: this.userId,
    });
  }

  public leaveSession(): void {
    this.socketService.send(SocketEvents.leaveRoom, {
      roomId: this.currentRoom(),
      userId: this.userId,
    });
  }

  public joinSession(session: string | null): void {
    session &&
      this.socketService.send(SocketEvents.joinRoom, {
        roomId: session,
        userId: this.userId,
      });
  }

  public async recordAudio(): Promise<void> {
    if (this.isRecording()) return;

    this.isRecording.set(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.audioContext.state === 'suspended' &&
        (await this.audioContext.resume());
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048; // even num between 32 and 32768, higher = more detail/resolution/CPU usage
      const bufferLength = this.analyser.frequencyBinCount;
      this.data = new Uint8Array(bufferLength);
      source.connect(this.analyser);

      this.draw();
    } catch (error) {
      this.isRecording.set(false);
    }
  }

  public async stopRecordingAudio(): Promise<void> {
    try {
      await this.audioContext.suspend();
      this.animationId && cancelAnimationFrame(this.animationId);
      this.isRecording.set(false); //TODO: bug that won't set to false if placed after await suspend();
    } catch (error) {
      //TODO: handle error, set recording state
    }
  }

  private async connect(): Promise<void> {
    // //set up ice candidates
    // this.connection.onicecandidate = (event) => {
    //   console.log('ice event: ', event);
    //   event.candidate &&
    //     this.socketService.send(SocketEvents.iceCandidate, {
    //       candidate: event.candidate,
    //     });
    // };
    // //set up connection options, send offer
    // this.connection.addTransceiver('audio', { direction: 'sendrecv' });
    // const offer = await this.connection.createOffer();
    // await this.connection.setLocalDescription(offer);
    // this.socketService.send(SocketEvents.offer, offer);
  }

  private initializeReceivers(): void {
    // //receive offer
    // this.socketService.receive(
    //   SocketEvents.offer,
    //   async (offer: RTCSessionDescriptionInit) => {
    //     console.log('offer: ', offer);
    //     await this.connection.setRemoteDescription(
    //       new RTCSessionDescription(offer)
    //     );
    //     //send answer per offer
    //     const answer = await this.connection.createAnswer();
    //     await this.connection.setLocalDescription(answer);
    //     this.socketService.send(SocketEvents.answer, answer);
    //   }
    // );
    // //receive answer
    // this.socketService.receive(
    //   SocketEvents.answer,
    //   async (answer: RTCSessionDescriptionInit) => {
    //     console.log('answer: ', answer);
    //     await this.connection.setRemoteDescription(
    //       new RTCSessionDescription(answer)
    //     );
    //   }
    // );
    // //receive ice candidates
    // this.socketService.receive(
    //   SocketEvents.iceCandidate,
    //   ({ candidate }) =>
    //     candidate.candidate &&
    //     this.connection.addIceCandidate(new RTCIceCandidate(candidate))
    // );
    this.receiveJoinRoom();
    this.receiveGetRooms();
  }

  private receiveJoinRoom(): void {
    this.socketService.receive(
      SocketEvents.joinRoom,
      (data: { roomMembers: UUID[]; newMember: UUID; roomId: string }) => {
        this.currentRoom.set(data.roomId);
        if (this.userId !== data.newMember) {
          //TODO: Convert log to toast message
          console.log(`New user ${data.newMember} joined room.`);
          this.roomConnections.set(data.newMember, new RTCPeerConnection()); //TODO: Add STUN/TURN server
          this.roomMembers.update((members) => [...members, data.newMember]);
        } else {
          //is the new user, create new connections for all other users
          this.roomConnections = new Map();
          const roomMembers: UUID[] = [];
          for (const member of data.roomMembers) {
            const connection = new RTCPeerConnection(); //TODO: Add STUN/TURN server
            this.roomConnections.set(member, connection);
            roomMembers.push(member);
          }
          this.roomMembers.set(roomMembers);
        }
      },
    );
  }

  private receiveGetRooms(): void {
    this.socketService.receive(SocketEvents.getRooms, (rooms: string[]) =>
      this.availableSessions.set(rooms),
    );
  }

  private drawCallback = () => this.draw(); //handling callback this binding

  private draw(): void {
    if (!this.analyser) return;
    if (!this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    this.animationId = requestAnimationFrame(this.drawCallback);
    this.analyser.getByteFrequencyData(this.data);

    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);

    //https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData
    const barWidth = (width / this.data.length) * 2.5;
    let x = 0;

    for (const byte of this.data) {
      const barHeight = byte / 2;
      const red = byte;
      const green = 255 - red;

      context.fillStyle = `rgb(${red}, ${green}, 50)`;
      context.fillRect(x, height - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }
  }
}
