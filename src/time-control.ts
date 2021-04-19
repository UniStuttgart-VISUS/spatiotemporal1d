import { Selection } from 'd3-selection';
import { TimeInterval } from 'd3-time';
import { Dispatch, dispatch } from 'd3-dispatch';

export function createControls<T>(
  dv: Selection<HTMLDivElement, any, any, any>,
  animator: TimestepControl<T>
): void {
  // prev, next, play/pause buttons
  const controls = dv.append<HTMLDivElement>('div')
    .style('display', 'grid')
    .style('width', '300px')
    .style('grid-template-columns', 'repeat(4,1fr)');
  const prev_btn = controls.append('button')
    .attr('id', 'timecontrol-button-prev')
    .text('prev')
    .on('click', _ => animator.prev());
  animator.on('prev.prev-button', (enabled: boolean) => prev_btn.attr('disabled', enabled?null:true));
  const play_btn = controls.append('button')
    .attr('id', 'timecontrol-button-play')
    .text('play')
    .on('click', _ => animator.play());
  animator.on('start.play-button', () => {
    play_btn.text('stop')
      .on('click', _ => animator.stop());
  });
  animator.on('stop.play-button', () => {
    play_btn.text('play')
      .on('click', _ => animator.play());
  });
  const next_btn = controls.append('button')
    .attr('id', 'timecontrol-button-next')
    .text('next')
    .on('click', _ => animator.next());
  animator.on('next.next-button', (enabled: boolean) => next_btn.attr('disabled', enabled?null:true));

  const playback_speeds = [100,200,300,500,700,1000,1500,2000];
  const st = controls.append('select')
    .attr('id', 'playback-speeds');
  playback_speeds.forEach(speed => {
    st.append('option')
      .attr('value', speed)
      .html(`${speed}&thinsp;ms`);
  });
  st.node().value = "1000";
  st.on('change', () => {
    const val = parseInt(st.node().value);
    animator.setPlaybackSpeed(val);
  });
}

interface TimestepControl<T> {
  setValue: (t: T) => void;
  prev: () => void;
  next: () => void;
  on: ((event: string, callback_fn?: null | ((...args: any) => void)) => (void | ((...args: any) => void)));
  stop: () => void;
  play: () => void;
  setPlaybackSpeed: (speed: number) => void;
  getPlaybackSpeed: () => number;
};

export class SingleTimestepControl implements TimestepControl<Date> {
  private _dispatch: Dispatch<any>;
  private _current_value: Date;
  private _current_animation_id: ReturnType<typeof setTimeout> | null = null;

  private _playback_speed: number = 1000; // ms

  constructor(
    private _interval: TimeInterval,
    private _extent: [Date, Date],
    private _step: number
  ) {
    this._dispatch = dispatch<any>('change', 'start', 'stop', 'prev', 'next');
    this.on = this._dispatch.on.bind(this._dispatch);

    this._current_value = this._extent[1];
  }

  declare on: ((event: string, callback_fn?: null | ((...args: any) => void)) => (void | ((...args: any) => void)));

  setValue(val: Date): void {
    this.change(val);
    this.stop();
  }

  prev(): void {
    this.stop();
    if (this._current_value <= this._extent[0]) console.error('current value already at minimum!');
    else {
      const d = this._interval.offset(this._current_value, -this._step);
      if (d < this._extent[0]) this.change(this._extent[0]);
      else this.change(d);
    }
  }

  next(): void {
    this.stop();
    if (this._current_value >= this._extent[1]) console.error('current value already at maximum!');
    else {
      const d = this._interval.offset(this._current_value, this._step);
      if (d > this._extent[1]) this.change(this._extent[1]);
      else this.change(d);
    }
  }

  private change(val: Date): void {
    this._current_value = val;
    this._dispatch.call('change', undefined, this._current_value);
    this._dispatch.call('prev', undefined, this._current_value > this._extent[0]);
    this._dispatch.call('next', undefined, this._current_value < this._extent[1]);
  }

  stop(): void {
    if (this._current_animation_id !== null) {
      clearInterval(this._current_animation_id);
      this._current_animation_id = null;
    }
    this._dispatch.call('stop');
  }

  play(): void {
    if (this._current_animation_id !== null) {
      console.error('current animation ID not null!');
      return;
    }

    this._dispatch.call('start');
    this._current_animation_id = setInterval(() => {
      // step
      const d = this._interval.offset(this._current_value, this._step);
      if (d >= this._extent[1]) {
        this.change(this._extent[1]);
        this.stop();
      } else {
        this.change(d);
      }
    }, this._playback_speed);
  }

  setPlaybackSpeed(s: number): void {
    this._playback_speed = s;
  }
  getPlaybackSpeed(): number {
    return this._playback_speed;
  }
};


export class IntervalTimestepControl implements TimestepControl<[Date, Date]> {
  private _dispatch: Dispatch<any>;
  private _current_value: [Date, Date];
  private _current_animation_id: ReturnType<typeof setTimeout> | null = null;

  private _playback_speed: number = 1000;

  constructor(
    private _interval: TimeInterval,
    private _extent: [Date, Date],
    private _step: number
  ) {
    this._dispatch = dispatch<any>('change', 'start', 'stop', 'prev', 'next');
    this.on = this._dispatch.on.bind(this._dispatch);

    this._current_value = this._extent;
  }

  declare on: ((event: string, callback_fn?: null | ((...args: any) => void)) => (void | ((...args: any) => void)));

  setValue(vals: [Date, Date]): void {
    this.change(vals);
    this.stop();
  }

  prev(): void {
    this.stop();
    this.stepBackwards();
  }

  private stepBackwards(): void {
    if (this._current_value[0] <= this._extent[0]) console.error('current value already at minimum!');
    else {
      const prev_a = this._interval.offset(this._current_value[0], -this._step);
      if (prev_a < this._extent[0]) {
        let [a,b] = this._current_value;
        while (a > this._extent[0]) {
          a = this._interval.offset(a, -1);
          b = this._interval.offset(b, -1);
        }
        this.change([a,b]);
      } else {
        this.change([
          this._interval.offset(this._current_value[0], -this._step),
          this._interval.offset(this._current_value[1], -this._step)
        ]);
      }
    }
  }

  next(): void {
    this.stop();
    this.stepForwards();
  }

  private stepForwards(): void {
    if (this._current_value[1] >= this._extent[1]) console.error('current value already at maximum!');
    else {
      const next_b = this._interval.offset(this._current_value[1], this._step);
      if (next_b > this._extent[1]) {
        let [a,b] = this._current_value;
        while (b < this._extent[1]) {
          a = this._interval.offset(a, 1);
          b = this._interval.offset(b, 1);
        }
        this.change([a,b]);
      } else {
        this.change([
          this._interval.offset(this._current_value[0], this._step),
          this._interval.offset(this._current_value[1], this._step)
        ]);
      }
    }
  }

  private change(vals: [Date, Date]): void {
    this._current_value = vals;
    this._dispatch.call('change', undefined, this._current_value);
    this._dispatch.call('prev', undefined, this._current_value[0] > this._extent[0]);
    this._dispatch.call('next', undefined, this._current_value[1] < this._extent[1]);
  }

  stop(): void {
    if (this._current_animation_id !== null) {
      clearInterval(this._current_animation_id);
      this._current_animation_id = null;
    }
    this._dispatch.call('stop');
  }

  play(): void {
    if (this._current_animation_id !== null) {
      console.error('current animation ID not null!');
      return;
    }

    this._dispatch.call('start');
    this._current_animation_id = setInterval(() => {
      this.stepForwards();
      if (this._current_value[1] >= this._extent[1]) this.stop();
    }, this._playback_speed);
  }

  setPlaybackSpeed(s: number): void {
    this._playback_speed = s;
  }
  getPlaybackSpeed(): number {
    return this._playback_speed;
  }
};
