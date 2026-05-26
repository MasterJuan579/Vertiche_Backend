/* ============================================================================
 * Archivo: PaletEtapaLogModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de PaletEtapaLog. Bitácora del paso del Palet por
 *              cada etapa RFID (recepción, QA, packing). Aquí se define
 *              el enum EtapaRFID que también usan EventoLectura y Anomalia.
 * ============================================================================ */
import {Model} from 'sequelize';

interface PaletEtapaLogAtributos{
    id:number,
    palet_id:string,
    etapa:string,
    timestamp_entrada:Date,
    timestamp_salida:Date,
    prepacks_entrada:number,
    prepacks_salida:number,
    tiene_anomalia:boolean,
    notas:string
}

export enum EtapaRFID{
    RECEPCION = 'RECEPCION',
    QA = 'QA',
    SORTING = 'SORTING',
    PACKING = 'PACKING',
    SALIDA = 'SALIDA'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class PaletEtapaLogModel extends Model<PaletEtapaLogAtributos>
    implements PaletEtapaLogAtributos{
        id!: number;
        palet_id!: string;
        etapa!: string;
        timestamp_entrada!: Date;
        timestamp_salida!: Date;
        prepacks_entrada!: number;
        prepacks_salida!: number;
        tiene_anomalia!: boolean;
        notas!: string;
        static associate(models:any){
            //PaletEtapaLog N:1 Palet
            PaletEtapaLogModel.belongsTo(models.Palet,{
                foreignKey:'palet_id'
            });
        }
    }
    PaletEtapaLogModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        palet_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Palet',
                key:'palet_id'
            }
        },
        etapa:{
            type:DataTypes.ENUM,
            values:Object.values(EtapaRFID),
            allowNull:false
        },
        timestamp_entrada:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        timestamp_salida:DataTypes.DATE,
        prepacks_entrada:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        },
        prepacks_salida:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        },
        tiene_anomalia:{
            type:DataTypes.BOOLEAN,
            allowNull:false,
            defaultValue:false
        },
        notas:DataTypes.STRING
    },{
        sequelize,
        modelName:'PaletEtapaLog'
    });
    return PaletEtapaLogModel;
}