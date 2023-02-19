type AssetObject = {
  base64?: string;
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  type?: string;
  fileName?: string;
  duration?: number;
  bitrate?: number;
  timestamp?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
};

export type ResponseObject = {
  didCancel: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets: AssetObject[];
};
