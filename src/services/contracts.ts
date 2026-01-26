/**
 * LIFT & LAGER - Service Contracts
 * Sprint 1: Interface definitions only - no implementation
 * 
 * These contracts define the expected API for each service module.
 * Implementation will be added in later sprints.
 */

// ============================================
// CHAT SERVICE
// ============================================

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: "text" | "image" | "location" | "snap";
  readBy: string[];
}

export interface ChatThread {
  id: string;
  participants: string[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  isGroup: boolean;
  name?: string;
}

export interface ChatService {
  getThreads(): Promise<ChatThread[]>;
  getMessages(threadId: string): Promise<ChatMessage[]>;
  sendMessage(threadId: string, content: string, type?: ChatMessage["type"]): Promise<ChatMessage>;
  markAsRead(threadId: string, messageId: string): Promise<void>;
  createThread(participantIds: string[], name?: string): Promise<ChatThread>;
}

// Placeholder implementation
export const chatService: ChatService = {
  getThreads: async () => {
    throw new Error("Not implemented - Sprint 2+");
  },
  getMessages: async () => {
    throw new Error("Not implemented - Sprint 2+");
  },
  sendMessage: async () => {
    throw new Error("Not implemented - Sprint 2+");
  },
  markAsRead: async () => {
    throw new Error("Not implemented - Sprint 2+");
  },
  createThread: async () => {
    throw new Error("Not implemented - Sprint 2+");
  },
};

// ============================================
// LOCATION SERVICE
// ============================================

export interface UserLocation {
  userId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number;
  timestamp: Date;
  activity?: "skiing" | "walking" | "stationary" | "lift";
}

export interface LocationService {
  getCurrentLocation(): Promise<UserLocation>;
  watchLocation(callback: (location: UserLocation) => void): () => void;
  getGroupLocations(): Promise<UserLocation[]>;
  shareLocation(location: UserLocation): Promise<void>;
  stopSharing(): Promise<void>;
}

export const locationService: LocationService = {
  getCurrentLocation: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
  watchLocation: () => {
    throw new Error("Not implemented - Sprint 3+");
  },
  getGroupLocations: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
  shareLocation: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
  stopSharing: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
};

// ============================================
// WEATHER SERVICE
// ============================================

export interface WeatherCondition {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  condition: "sunny" | "cloudy" | "snow" | "rain" | "fog" | "mixed";
  icon: string;
  uvIndex: number;
}

export interface SkiConditions {
  snowDepth: number;
  freshSnow: number;
  avalancheRisk: 1 | 2 | 3 | 4 | 5;
  liftsOpen: number;
  liftsTotal: number;
  slopesOpen: number;
  slopesTotal: number;
}

export interface WeatherForecast {
  date: Date;
  high: number;
  low: number;
  condition: WeatherCondition["condition"];
  snowfall: number;
}

export interface WeatherService {
  getCurrentWeather(): Promise<WeatherCondition>;
  getSkiConditions(): Promise<SkiConditions>;
  getForecast(days: number): Promise<WeatherForecast[]>;
}

export const weatherService: WeatherService = {
  getCurrentWeather: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
  getSkiConditions: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
  getForecast: async () => {
    throw new Error("Not implemented - Sprint 3+");
  },
};

// ============================================
// NOTIFICATION SERVICE
// ============================================

export interface Notification {
  id: string;
  type: "chat" | "location" | "challenge" | "weather" | "system";
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: Date;
  read: boolean;
}

export interface NotificationPreferences {
  chatMessages: boolean;
  locationUpdates: boolean;
  challenges: boolean;
  weatherAlerts: boolean;
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string;
}

export interface NotificationService {
  requestPermission(): Promise<boolean>;
  getNotifications(): Promise<Notification[]>;
  markAsRead(notificationId: string): Promise<void>;
  getPreferences(): Promise<NotificationPreferences>;
  updatePreferences(prefs: Partial<NotificationPreferences>): Promise<void>;
  subscribeToTopic(topic: string): Promise<void>;
  unsubscribeFromTopic(topic: string): Promise<void>;
}

export const notificationService: NotificationService = {
  requestPermission: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
  getNotifications: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
  markAsRead: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
  getPreferences: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
  updatePreferences: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
  subscribeToTopic: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
  unsubscribeFromTopic: async () => {
    throw new Error("Not implemented - Sprint 4+");
  },
};

// ============================================
// CHALLENGE SERVICE
// ============================================

export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: "distance" | "speed" | "elevation" | "social" | "custom";
  target: number;
  unit: string;
  startDate: Date;
  endDate: Date;
  participants: string[];
  createdBy: string;
}

export interface ChallengeProgress {
  challengeId: string;
  userId: string;
  progress: number;
  rank: number;
  completedAt?: Date;
}

export interface Leaderboard {
  challengeId: string;
  entries: Array<{
    userId: string;
    userName: string;
    progress: number;
    rank: number;
  }>;
}

export interface ChallengeService {
  getChallenges(): Promise<Challenge[]>;
  getChallenge(id: string): Promise<Challenge>;
  createChallenge(challenge: Omit<Challenge, "id">): Promise<Challenge>;
  joinChallenge(challengeId: string): Promise<void>;
  leaveChallenge(challengeId: string): Promise<void>;
  getProgress(challengeId: string): Promise<ChallengeProgress>;
  getLeaderboard(challengeId: string): Promise<Leaderboard>;
  updateProgress(challengeId: string, progress: number): Promise<void>;
}

export const challengeService: ChallengeService = {
  getChallenges: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  getChallenge: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  createChallenge: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  joinChallenge: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  leaveChallenge: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  getProgress: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  getLeaderboard: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
  updateProgress: async () => {
    throw new Error("Not implemented - Sprint 5+");
  },
};
