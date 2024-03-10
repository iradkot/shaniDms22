import {BgSample} from 'app/types/day_bgs.types';

type FormattedEvent = {
  bgData: BgSample[];
};
export type CommonFormattedEvent = {
  bgData: BgSample[];
  localDateString: string;
};
