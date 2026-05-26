import { DB_NAME,DB_USER,DB_PASSWORD,DB_HOST } from ".";

export default{
    "development":{
        "username":DB_USER,
        "password":DB_PASSWORD,
        "database":DB_NAME,
        "host":DB_HOST,
        "dialect":"mysql"
    }
}