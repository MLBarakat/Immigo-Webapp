
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "active_user_sessions": {
                  Row: {
                    "device_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "device_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "device_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_progress_reports": {
                  Row: {
                    "created_at": string,"date": string,"embedding": string | null,"id": string,"report_markdown": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date"?: string,"embedding"?: string | null,"id"?: string,"report_markdown": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"embedding"?: string | null,"id"?: string,"report_markdown"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"feedback": {
                  Row: {
                    "app_version": string | null,"category": string,"created_at": string,"email": string | null,"id": string,"include_diagnostics": boolean,"locale": string | null,"message": string,"status": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"category": string,"created_at"?: string,"email"?: string | null,"id"?: string,"include_diagnostics"?: boolean,"locale"?: string | null,"message": string,"status"?: string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"category"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"include_diagnostics"?: boolean,"locale"?: string | null,"message"?: string,"status"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"graded_answers": {
                  Row: {
                    "confidence": number | null,"created_at": string,"id": string,"item_id": string,"session_id": string | null,"simulation_mode": string,"test_version": string,"used_hint": boolean,"user_id": string,"verdict": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: number | null,"created_at"?: string,"id"?: string,"item_id": string,"session_id"?: string | null,"simulation_mode"?: string,"test_version"?: string,"used_hint"?: boolean,"user_id": string,"verdict": string
                  }
                  Update: {
                    "confidence"?: number | null,"created_at"?: string,"id"?: string,"item_id"?: string,"session_id"?: string | null,"simulation_mode"?: string,"test_version"?: string,"used_hint"?: boolean,"user_id"?: string,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "graded_answers_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "content": string,"created_at": string,"id": string,"role": string,"session_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"id"?: string,"role": string,"session_id": string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"id"?: string,"role"?: string,"session_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"mock_exam_answers": {
                  Row: {
                    "created_at": string,"exam_id": string,"id": string,"item_id": string,"user_id": string,"verdict": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exam_id": string,"id"?: string,"item_id": string,"user_id": string,"verdict": string
                  }
                  Update: {
                    "created_at"?: string,"exam_id"?: string,"id"?: string,"item_id"?: string,"user_id"?: string,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mock_exam_answers_exam_id_fkey"
      columns: ["exam_id"]
isOneToOne: false
      referencedRelation: "mock_exams"
      referencedColumns: ["id"]
    }
                  ]
                },"mock_exam_english_answers": {
                  Row: {
                    "created_at": string,"exam_id": string,"feedback": string,"id": string,"prompt_id": string,"prompt_index": number,"request_id": string,"response_text": string,"section": string,"user_id": string,"verdict": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exam_id": string,"feedback": string,"id"?: string,"prompt_id": string,"prompt_index": number,"request_id": string,"response_text": string,"section": string,"user_id": string,"verdict": string
                  }
                  Update: {
                    "created_at"?: string,"exam_id"?: string,"feedback"?: string,"id"?: string,"prompt_id"?: string,"prompt_index"?: number,"request_id"?: string,"response_text"?: string,"section"?: string,"user_id"?: string,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mock_exam_english_answers_exam_id_fkey"
      columns: ["exam_id"]
isOneToOne: false
      referencedRelation: "mock_exams"
      referencedColumns: ["id"]
    }
                  ]
                },"mock_exams": {
                  Row: {
                    "completed_at": string | null,"correct_count": number,"created_at": string,"current_index": number,"english_stage": string,"id": string,"include_english_simulation": boolean,"incorrect_count": number,"question_ids": (string)[],"reading_passed": boolean | null,"reading_prompt_ids": (string)[],"report_markdown": string | null,"session_id": string | null,"status": string,"test_version": string,"updated_at": string,"user_id": string,"writing_passed": boolean | null,"writing_prompt_ids": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"correct_count"?: number,"created_at"?: string,"current_index"?: number,"english_stage"?: string,"id"?: string,"include_english_simulation"?: boolean,"incorrect_count"?: number,"question_ids"?: (string)[],"reading_passed"?: boolean | null,"reading_prompt_ids"?: (string)[],"report_markdown"?: string | null,"session_id"?: string | null,"status"?: string,"test_version": string,"updated_at"?: string,"user_id": string,"writing_passed"?: boolean | null,"writing_prompt_ids"?: (string)[]
                  }
                  Update: {
                    "completed_at"?: string | null,"correct_count"?: number,"created_at"?: string,"current_index"?: number,"english_stage"?: string,"id"?: string,"include_english_simulation"?: boolean,"incorrect_count"?: number,"question_ids"?: (string)[],"reading_passed"?: boolean | null,"reading_prompt_ids"?: (string)[],"report_markdown"?: string | null,"session_id"?: string | null,"status"?: string,"test_version"?: string,"updated_at"?: string,"user_id"?: string,"writing_passed"?: boolean | null,"writing_prompt_ids"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "mock_exams_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string | null,"full_name": string | null,"id": string,"language": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"full_name"?: string | null,"id": string,"language"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"full_name"?: string | null,"id"?: string,"language"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"session_reports": {
                  Row: {
                    "analytics_data": Json | null,"created_at": string | null,"id": string,"session_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analytics_data"?: Json | null,"created_at"?: string | null,"id"?: string,"session_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "analytics_data"?: Json | null,"created_at"?: string | null,"id"?: string,"session_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"sessions": {
                  Row: {
                    "current_goal": string | null,"current_item_id": string | null,"current_mode": string,"ended_at": string | null,"id": string,"include_english_simulation": boolean,"local_date": string | null,"local_timezone": string | null,"mode_goal_pending": boolean,"started_at": string,"status": string,"test_version": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "current_goal"?: string | null,"current_item_id"?: string | null,"current_mode"?: string,"ended_at"?: string | null,"id"?: string,"include_english_simulation"?: boolean,"local_date"?: string | null,"local_timezone"?: string | null,"mode_goal_pending"?: boolean,"started_at"?: string,"status"?: string,"test_version"?: string,"user_id": string
                  }
                  Update: {
                    "current_goal"?: string | null,"current_item_id"?: string | null,"current_mode"?: string,"ended_at"?: string | null,"id"?: string,"include_english_simulation"?: boolean,"local_date"?: string | null,"local_timezone"?: string | null,"mode_goal_pending"?: boolean,"started_at"?: string,"status"?: string,"test_version"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_settings": {
                  Row: {
                    "account_timezone": string | null,"ai_voice_id": string,"barge_in": string,"barge_in_sensitivity": number,"created_at": string | null,"font_size": string,"has_seen_welcome": boolean | null,"input_device_id": string | null,"language": string,"live_feedback_enabled": boolean,"location_state": string | null,"mic_consent_version": string | null,"mic_mode": string,"notifications_enabled": boolean,"output_device_id": string | null,"progress_report_frequency": string,"reminder_time": string,"theme": string,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_timezone"?: string | null,"ai_voice_id"?: string,"barge_in"?: string,"barge_in_sensitivity"?: number,"created_at"?: string | null,"font_size"?: string,"has_seen_welcome"?: boolean | null,"input_device_id"?: string | null,"language"?: string,"live_feedback_enabled"?: boolean,"location_state"?: string | null,"mic_consent_version"?: string | null,"mic_mode"?: string,"notifications_enabled"?: boolean,"output_device_id"?: string | null,"progress_report_frequency"?: string,"reminder_time"?: string,"theme"?: string,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "account_timezone"?: string | null,"ai_voice_id"?: string,"barge_in"?: string,"barge_in_sensitivity"?: number,"created_at"?: string | null,"font_size"?: string,"has_seen_welcome"?: boolean | null,"input_device_id"?: string | null,"language"?: string,"live_feedback_enabled"?: boolean,"location_state"?: string | null,"mic_consent_version"?: string | null,"mic_mode"?: string,"notifications_enabled"?: boolean,"output_device_id"?: string | null,"progress_report_frequency"?: string,"reminder_time"?: string,"theme"?: string,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "question_mastery": {
                  Row: {
                    "attempts": number | null,"correct_count": number | null,"item_id": string,"mastered": boolean | null,"mastery_pct": number | null,"test_version": string,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "get_or_create_daily_learning_session":
{ Args: { "p_timezone": string,"p_user_id": string }; Returns: {
              "current_goal": string | null,
"current_item_id": string | null,
"current_mode": string,
"ended_at": string | null,
"id": string,
"include_english_simulation": boolean,
"local_date": string | null,
"local_timezone": string | null,
"mode_goal_pending": boolean,
"started_at": string,
"status": string,
"test_version": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "sessions"
        isOneToOne: false
        isSetofReturn: true
      } },
"match_progress_reports":
{ Args: { "match_count": number,"match_threshold": number,"p_user_id": string,"query_embedding": string }; Returns: {
              "date": string,"id": string,"report_markdown": string,"similarity": number
            }[]
                           },
"purge_old_messages":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
