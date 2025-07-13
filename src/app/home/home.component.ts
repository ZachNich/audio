import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { SocketService } from '../services/socket.service';
import { SocketEvents } from '../services/socket.enum';

@Component({
  selector: 'app-home',
  imports: [],
  providers: [SocketService],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('equalizerCanvas')
  canvasRef?: ElementRef<HTMLCanvasElement>;
  public isRecording = false;
  public animationId: number | null = null;
  public audioContext = new AudioContext();
  public analyser: AnalyserNode | null = null;
  public data: Uint8Array<ArrayBuffer> = new Uint8Array();
  private readonly subscriptions = new Subscription();

  constructor(private socketService: SocketService) {}

  public ngOnInit(): void {
    this.send();
  }

  public ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  public async recordAudio(): Promise<void> {
    if (this.isRecording) return;

    this.isRecording = true;
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
      this.isRecording = false;
    }
  }

  public async stopRecordingAudio(): Promise<void> {
    try {
      await this.audioContext.suspend();
      this.animationId && cancelAnimationFrame(this.animationId);
      this.isRecording = false;
    } catch (error) {
      //TODO: handle error, set recording state
    }
  }

  private send(): void {
    this.socketService.send(SocketEvents.events, [
      'I like chocolate chip cookies.',
    ]);
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
