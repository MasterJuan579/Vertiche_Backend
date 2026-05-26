/* ============================================================================
 * Archivo: AnomaliaModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Anomalia. Cualquier evento fuera de lo esperado
 *              durante el flujo (lectura duplicada, tag desconocido, bahía
 *              equivocada, etc.). Incluye enum TipoAnomalia.
 * Nota: EtapaRFID se redeclara aquí (también vive en PaletEtapaLogModel y
 *       EventoLecturaModel) porque module.exports sobreescribe los
 *       export enum cuando se importan entre modelos.
 * ============================================================================ */
import {Model} from 'sequelize';

interface AnomaliaAtributos{
    id:number,
    epc:string,
    tipo_error:string,
    lector_id:string,
    bahia:string,
    etapa:string,
    timestamp:Date,
    proveedor_id:number,
    resuelto:boolean,
    descripcion:string
}

export enum EtapaRFID{
    RECEPCION = 'RECEPCION',
    QA = 'QA',
    SORTING = 'SORTING',
    PACKING = 'PACKING',
    SALIDA = 'SALIDA'
}

export enum TipoAnomalia{
    TAG_DESCONOCIDO = 'TAG_DESCONOCIDO',
    LECTURA_DUPLICADA = 'LECTURA_DUPLICADA',
    BAHIA_INCORRECTA = 'BAHIA_INCORRECTA',
    TIENDA_INCORRECTA = 'TIENDA_INCORRECTA',
    QA_FALLIDO = 'QA_FALLIDO',
    PALET_INCOMPLETO = 'PALET_INCOMPLETO',
    RSSI_BAJO = 'RSSI_BAJO',
    FUERA_DE_SECUENCIA = 'FUERA_DE_SECUENCIA'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class AnomaliaModel extends Model<AnomaliaAtributos>
    implements AnomaliaAtributos{
        id!: number;
        epc!: string;
        tipo_error!: string;
        lector_id!: string;
        bahia!: string;
        etapa!: string;
        timestamp!: Date;
        proveedor_id!: number;
        resuelto!: boolean;
        descripcion!: string;
        static associate(models:any){
            //Anomalia N:1 Tag
            AnomaliaModel.belongsTo(models.Tag,{
                foreignKey:'epc'
            });
            //Anomalia N:1 Proveedor
            AnomaliaModel.belongsTo(models.Proveedor,{
                foreignKey:'proveedor_id'
            });
        }
    }
    AnomaliaModel.init({
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
        tipo_error:{
            type:DataTypes.ENUM,
            values:Object.values(TipoAnomalia),
            allowNull:false
        },
        lector_id:DataTypes.STRING,
        bahia:DataTypes.STRING,
        etapa:{
            type:DataTypes.ENUM,
            values:Object.values(EtapaRFID),
            allowNull:false
        },
        timestamp:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        proveedor_id:{
            type:DataTypes.INTEGER,
            references:{
                model:'Proveedor',
                key:'id'
            }
        },
        resuelto:{
            type:DataTypes.BOOLEAN,
            allowNull:false,
            defaultValue:false
        },
        descripcion:DataTypes.STRING
    },{
        sequelize,
        modelName:'Anomalia'
    });
    return AnomaliaModel;
}