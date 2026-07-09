import { Request, Response } from 'express';
import { AuthService } from './auth.service';

const authService = new AuthService();

//Helper to set the httpOnly cookie for refresh token
const setRefreshTokenCookie = (res: Response, token: string) => {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
}

export class AuthController {
    async signUp(req: Request, res: Response) {
        try{
            const { username, email, password } = req.body;
            const result = await authService.signUp(username, email, password);

            setRefreshTokenCookie(res, result.refreshToken);
            res.status(201).json({ user: result.user, accessToken: result.accessToken });
        } catch (error: any) {
            res.status(400).json({error: error.message});
        }
    }

    async login(req: Request, res: Response) {
        try{
            console.log("entered controller");
            const { email, password } = req.body;
            const result = await authService.login(email, password);

            setRefreshTokenCookie(res, result.refreshToken);
            res.status(200).json({ user: result.user, accessToken: result.accessToken });
        } catch (error: any) {
            res.status(400).json({error: error.message});
        }
    }

    async refresh(req: Request, res: Response) {
        try{
            console.log("entered controller");
            //Assuming cookie-parser middleware is used
            const {refreshToken} = req.cookies;
            if(!refreshToken) throw new Error('No refresh token provided.');

            const result = await authService.refresh(refreshToken);

            setRefreshTokenCookie(res, result.refreshToken);
            res.status(200).json({ accessToken: result.accessToken });
        } catch (error: any) {
            res.status(401).json({error: error.message});
        }
    }

    async logout(req: Request, res: Response) {
        try{
            const { refreshToken } = req.cookies;
            const authHeader = req.headers.authorization;
            const accessToken = authHeader && authHeader?.split(' ')[1];
            console.log("accessToken:", accessToken);
            await authService.logout(accessToken as string, refreshToken);

            res.clearCookie('refreshToken');
            res.status(200).json({ message: 'Logged out successfully'});
        } catch (error: any) {
            res.status(500).json({error: 'Logout failed'});
        }
    }
}