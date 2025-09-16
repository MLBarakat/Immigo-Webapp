/**
* Defines the shape of the data payload required for user registration.
* Using a dedicated interface ensures type safety and consistency across the application.
*/
export interface RegisterPayload {
    name: string;
    email: string;
    password: string;
}