/* ============================================================================
 * Archivo: OrdenAgrupadorModel.ts
 * Responsable: team-rfid (Moisés Falcón).
 * Descripción: Asocia UN solo chip RFID "maestro" (EPC único) a una
 *              OrdenCompra completa. Es OPCIONAL: una OC puede tener cero
 *              o un agrupador. Coexiste con los Tags individuales — cada
 *              prepack sigue pudiendo tener su propio EPC.
 *
 *              Cuando ese EPC del agrupador se lee en cualquier etapa,
 *              RfidController.postLectura avanza en cascada todos los Tag
 *              de la OC (ver procesarLecturaAgrupador).
 *
 * Convención EPC:
 *   - Placeholder al crear: 'GRP-PENDIENTE-{orden_id}'.
 *   - EPC real: cualquier valor leído del chip físico que NO empiece con
 *     'PENDIENTE-' y que no colisione con un Tag.epc.
 * ============================================================================ */
import {Model} from 'sequelize';

interface OrdenAgrupadorAtributos{
    id:number,
    orden_id:string,
    epc:string
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class OrdenAgrupadorModel extends Model<OrdenAgrupadorAtributos>
    implements OrdenAgrupadorAtributos{
        id!: number;
        orden_id!: string;
        epc!: string;
        static associate(models:any){
            //OrdenAgrupador N:1 OrdenCompra (en realidad 1:1 por UNIQUE en orden_id)
            OrdenAgrupadorModel.belongsTo(models.OrdenCompra,{
                foreignKey:'orden_id'
            });
        }
    }
    OrdenAgrupadorModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        orden_id:{
            type:DataTypes.STRING,
            allowNull:false,
            unique:true,
            references:{
                model:'OrdenCompra',
                key:'orden_id'
            }
        },
        epc:{
            type:DataTypes.STRING,
            allowNull:false,
            unique:true
        }
    },{
        sequelize,
        modelName:'OrdenAgrupador',
        tableName:'OrdenAgrupador'
    });
    return OrdenAgrupadorModel;
}
