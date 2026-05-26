/* ============================================================================
 * Archivo: EventoLecturaModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de EventoLectura. Cada lectura de un Tag por un
 *              lector RFID (bahía, RSSI, etapa). Fuente primaria del flujo
 *              en planta.
 * Nota: EtapaRFID se redeclara aquí (también vive en PaletEtapaLogModel y
 *       AnomaliaModel) porque module.exports sobreescribe los export enum
 *       cuando se importan entre modelos.
 * ============================================================================ */
import {Model} from 'sequelize';

interface EventoLecturaAtributos{
    id:number,
    epc:string,
    lector_id:string,
    bahia:string,
    timestamp:Date,
    etapa:string,
    rssi:number,
    antenna_port:string,
    es_duplicado:boolean
}

export enum EtapaRFID{
    RECEPCION = 'RECEPCION',
    QA = 'QA',
    SORTING = 'SORTING',
    PACKING = 'PACKING',
    SALIDA = 'SALIDA'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class EventoLecturaModel extends Model<EventoLecturaAtributos>
    implements EventoLecturaAtributos{
        id!: number;
        epc!: string;
        lector_id!: string;
        bahia!: string;
        timestamp!: Date;
        etapa!: string;
        rssi!: number;
        antenna_port!: string;
        es_duplicado!: boolean;
        static associate(models:any){
            //EventoLectura N:1 Tag
            EventoLecturaModel.belongsTo(models.Tag,{
                foreignKey:'epc'
            });
        }
    }
    EventoLecturaModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        epc:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Tag',
                key:'epc'
            }
        },
        lector_id:{
            type:DataTypes.STRING,
            allowNull:false
        },
        bahia:{
            type:DataTypes.STRING,
            allowNull:false
        },
        timestamp:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        etapa:{
            type:DataTypes.ENUM,
            values:Object.values(EtapaRFID),
            allowNull:false
        },
        rssi:DataTypes.FLOAT,
        antenna_port:DataTypes.STRING,
        es_duplicado:{
            type:DataTypes.BOOLEAN,
            allowNull:false,
            defaultValue:false
        }
    },{
        sequelize,
        modelName:'EventoLectura'
    });
    return EventoLecturaModel;
}