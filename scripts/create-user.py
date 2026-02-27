#!/usr/bin/env python3
"""
Prompts for username and password, outputs the SQL to insert the user
(and optionally an API token). Requires: pip install bcrypt

Usage: python scripts/create_user.py
"""

import getpass
import hashlib
import secrets
import sys


def main() -> None:
    try:
        import bcrypt
    except ImportError:
        print("ERROR: Install bcrypt: pip install bcrypt", file=sys.stderr)
        sys.exit(1)

    username = input("Username: ").strip()
    if not username:
        print("Username cannot be empty.", file=sys.stderr)
        sys.exit(1)

    password = getpass.getpass("Password: ")
    if not password:
        print("Password cannot be empty.", file=sys.stderr)
        sys.exit(1)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()
    username_escaped = username.replace("'", "''")

    print("\n-- Run this SQL against your PostgreSQL database (e.g. psql -f -)\n")
    print(
        f"INSERT INTO users (username, password_hash, enabled)\n"
        f"VALUES ('{username_escaped}', '{password_hash}', true);\n"
    )

    create_token = input("Also create an API token for this user? (y/n): ").strip().lower()
    if create_token == "y":
        plain_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
        print("\n-- API token (store the plain token securely; it is shown only once):")
        print(f"-- Plain token: {plain_token}\n")
        print(
            "INSERT INTO api_tokens (user_id, token_hash, name)\n"
            f"VALUES ((SELECT id FROM users WHERE username = '{username_escaped}'), '{token_hash}', 'initial');\n"
        )


if __name__ == "__main__":
    main()
