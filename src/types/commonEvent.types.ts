import {BgSample} from 'app/types/day_bgs';

type FormattedEvent = {
  bgData: BgSample[];
};
export type CommonFormattedEvent = {
  bgData: BgSample[];
  localDateString: string;
};
