import { Modality } from "@google/genai";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  coordinate: LatLng;
  description?: string;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
  places?: Place[];
  groundingSources?: GroundingSource[];
}

export interface MapViewState {
  center: LatLng;
  zoom: number;
}

export const DEFAULT_CENTER: LatLng = { lat: 40.7128, lng: -74.0060 }; // NYC
export const DEFAULT_ZOOM = 13;
