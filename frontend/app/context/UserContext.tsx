'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface Permission {
    id: string;
    code: string;
    description: string;
}

interface Role {
    id: string;
    name: string;
    permissions: Permission[];
}

export interface User {

    id: string;

    username: string;

    full_name: string;

    role: Role;

    permissions: Permission[]; // Direct granular permissions

}



interface UserContextType {

    currentUser: User | null;

    users: User[];

    setCurrentUser: (user: User) => void;

    hasPermission: (permissionCode: string) => boolean;

    refreshUsers: () => Promise<void>;

}



const UserContext = createContext<UserContextType | undefined>(undefined);



export function UserProvider({ children }: { children: React.ReactNode }) {

    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const [users, setUsers] = useState<User[]>([]);



    const refreshUsers = async () => {

        try {

            const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

            const res = await fetch(`${API_BASE}/users`);

            if (res.ok) {

                const data = await res.json();

                setUsers(data);

                

                // Restore session or default to first user (Admin usually)

                const savedUserId = localStorage.getItem('current_user_id');

                if (savedUserId) {

                    const savedUser = data.find((u: User) => u.id === savedUserId);

                    if (savedUser) setCurrentUser(savedUser);

                    else if (data.length > 0) setCurrentUser(data[0]);

                } else if (data.length > 0) {

                    setCurrentUser(data[0]);

                }            }

        } catch (e) {

            console.error("Failed to fetch users", e);

        }

    };



    useEffect(() => {

        refreshUsers();

    }, []);



    const handleSetUser = (user: User) => {

        setCurrentUser(user);

        localStorage.setItem('current_user_id', user.id);

    };



    const hasPermission = (permissionCode: string): boolean => {

        if (!currentUser) return false;

        

        // 1. Check Role permissions

        if (currentUser.role) {

            if (currentUser.role.permissions.some(p => p.code === 'admin.access')) return true;

            if (currentUser.role.permissions.some(p => p.code === permissionCode)) return true;

        }



        // 2. Check Direct (Granular) permissions

        if (currentUser.permissions && currentUser.permissions.some(p => p.code === permissionCode)) {

            return true;

        }

        

        return false;

    };



    return (
        <UserContext.Provider value={{ currentUser, users, setCurrentUser: handleSetUser, hasPermission, refreshUsers }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within UserProvider');
    return context;
};
